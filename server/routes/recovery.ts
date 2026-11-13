import { z } from 'zod';
import { clientHash } from '../lib/crypto.js';
import { ensureMethod, HttpError, json, readJson } from '../lib/http.js';
import { sendBrandedRecoveryEmail } from '../email/recovery.js';
import type { RouteHandler } from './context.js';

const inputSchema = z
  .object({
    email: z.email().max(254),
  })
  .strict();

const receipt = {
  ok: true,
  message:
    'If the email belongs to an active RFP staff account, check its inbox for recovery instructions.',
};

/** The public endpoint never reveals account existence or sends links to the browser. */
export const handleRecoveryRoutes: RouteHandler = async ({ event, route, db, config }) => {
  if (route !== 'auth/recover') return undefined;
  ensureMethod(event, 'POST');
  if ((event.body?.length ?? 0) > 1000) throw new HttpError(413, 'Request is too large.');
  const { email: suppliedEmail } = inputSchema.parse(readJson(event));
  const email = suppliedEmail.trim().toLowerCase();

  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASSWORD || !config.SMTP_FROM_EMAIL) {
    throw new HttpError(503, 'Email recovery is temporarily unavailable. Please contact IT.');
  }

  // The existing transactional rate limiter is database-backed and atomic.
  // Namespace both hashes separately from RFP request submissions.
  const ip =
    event.headers['x-vercel-forwarded-for']?.split(',')[0] ||
    event.headers['x-real-ip'] ||
    event.headers['x-forwarded-for']?.split(',')[0] ||
    'unknown';
  const ipLimit = await db.rpc('record_submission_attempt', {
    p_client_hash: clientHash(`auth-recovery:ip:${ip}`),
    p_window_minutes: 60,
    p_max_attempts: 10,
  });
  if (ipLimit.error) throw ipLimit.error;
  if (!ipLimit.data) throw new HttpError(429, 'Too many recovery requests. Try again later.');

  const emailLimit = await db.rpc('record_submission_attempt', {
    p_client_hash: clientHash(`auth-recovery:email:${email}`),
    p_window_minutes: 60,
    p_max_attempts: 3,
  });
  if (emailLimit.error) throw emailLimit.error;
  if (!emailLimit.data) return json(200, receipt);

  // Only existing ACTIVE staff accounts may receive recovery links.
  // Unknown/inactive addresses receive the same response and no email.
  const profile = await db
    .from('profiles')
    .select('id')
    .eq('email', email)
    .eq('active', true)
    .maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data) return json(200, receipt);

  const redirectTo = new URL('/admin/reset-password', config.SITE_URL).toString();
  const generated = await db.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });
  if (generated.error || !generated.data.properties?.action_link) {
    // No account state, token, or internal Auth error is exposed to a caller.
    return json(200, receipt);
  }

  try {
    await sendBrandedRecoveryEmail(email, generated.data.properties.action_link);
  } catch {
    // In particular, never log exception objects containing an Auth action link.
    throw new HttpError(
      503,
      'Email delivery is unavailable. Please try again later or contact IT.',
    );
  }
  return json(200, receipt);
};

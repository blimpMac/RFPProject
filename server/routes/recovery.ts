import { z } from 'zod';
import { clientHash } from '../lib/crypto.js';
import { ensureMethod, HttpError, json, readJson } from '../lib/http.js';
import { sendBrandedRecoveryEmail } from '../email/recovery.js';
import { recoveryFromAddress, recoverySourceRecipients } from '../email/recovery-template.js';
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
    p_max_attempts: 6,
  });
  if (emailLimit.error) throw emailLimit.error;
  // This limit runs before account lookup, so the same response applies to
  // registered and unregistered addresses without exposing account existence.
  if (!emailLimit.data) {
    throw new HttpError(
      429,
      'Too many password reset requests for this address. Please wait up to 60 minutes before trying again.',
    );
  }

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
    // Preserve account-enumeration protection, but leave a sanitized diagnostic
    // for operators. Never log the email, action link, or token-bearing error.
    console.warn('RFP password recovery link generation failed.', {
      code: generated.error?.code || 'missing_action_link',
    });
    return json(502, {
      ok: false,
      error: 'We could not generate a password reset link. Please try again later or contact IT.',
    });
  }

  const fromAddress = recoveryFromAddress(config.SMTP_FROM_EMAIL).address;
  const sourceRecipients = recoverySourceRecipients(
    config.SMTP_USER,
    config.SMTP_FROM_EMAIL,
    email,
  );
  const auditInsert = await db
    .from('password_recovery_delivery_logs')
    .insert({
      user_id: profile.data.id,
      recipient_email: email,
      smtp_user: config.SMTP_USER,
      from_email: fromAddress,
      bcc_recipients: sourceRecipients,
      status: 'generated',
    })
    .select('id')
    .maybeSingle();
  const auditId = auditInsert.data?.id ?? null;
  if (auditInsert.error) {
    // The email path should continue even if diagnostics storage is unavailable.
    console.warn('RFP recovery audit insert failed.', {
      code: auditInsert.error.code || 'audit_insert_failed',
    });
  }

  try {
    const delivery = await sendBrandedRecoveryEmail(email, generated.data.properties.action_link);
    const accepted = new Set(delivery.acceptedRecipients);
    const recipientAccepted = accepted.has(email);
    const unacceptedSources = delivery.sourceRecipients.filter(
      (address) => !accepted.has(address.toLowerCase()),
    );
    // SMTP acceptance confirms the receiving mail server accepted the message,
    // not that it reached the recipient's Inbox. Keep that distinction in the audit.
    const status = !recipientAccepted
      ? 'failed'
      : unacceptedSources.length > 0
        ? 'partial'
        : 'smtp_accepted';
    if (auditId !== null) {
      const updated = await db
        .from('password_recovery_delivery_logs')
        .update({
          status,
          message_id: delivery.messageId || null,
          smtp_response: delivery.response,
          accepted_recipients: delivery.acceptedRecipients,
          rejected_recipients: [...new Set([...delivery.rejectedRecipients, ...unacceptedSources])],
          error_code: !recipientAccepted
            ? 'recipient_not_accepted_by_smtp'
            : unacceptedSources.length > 0
              ? 'source_copy_not_accepted_by_smtp'
              : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', auditId);
      if (updated.error) {
        console.warn('RFP recovery audit update failed.', {
          code: updated.error.code || 'audit_update_failed',
        });
      }
    }
    if (status !== 'smtp_accepted') {
      console.warn('RFP recovery email was not accepted for every destination.', {
        status,
        recipientAccepted,
        sourceCopiesAccepted: unacceptedSources.length === 0,
        smtpResponseCode: delivery.response.match(/^\\d{3}/)?.[0] || 'unavailable',
      });
      return json(502, {
        ok: false,
        error:
          status === 'partial'
            ? 'The reset email was not accepted by every configured mailbox. Please contact IT before requesting another link.'
            : 'The reset email could not be accepted by the recipient mailbox. Please try again later or contact IT.',
      });
    }
  } catch (error) {
    // Avoid account enumeration and never log the recipient or token-bearing URL.
    const safeError =
      error && typeof error === 'object'
        ? (error as { code?: unknown; name?: unknown; responseCode?: unknown })
        : {};
    const errorCode =
      typeof safeError.code === 'string'
        ? safeError.code
        : typeof safeError.responseCode === 'number'
          ? String(safeError.responseCode)
          : 'smtp_delivery_failed';
    const errorName = typeof safeError.name === 'string' ? safeError.name : 'Error';
    if (auditId !== null) {
      const updated = await db
        .from('password_recovery_delivery_logs')
        .update({
          status: 'failed',
          error_code: errorCode,
          error_name: errorName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', auditId);
      if (updated.error) {
        console.warn('RFP recovery audit update failed.', {
          code: updated.error.code || 'audit_update_failed',
        });
      }
    }
    console.warn('RFP password recovery SMTP delivery failed.', {
      code: errorCode,
      name: errorName,
    });
    return json(502, {
      ok: false,
      error: 'We could not send the password reset email. Please try again later or contact IT.',
    });
  }
  return json(200, receipt);
};

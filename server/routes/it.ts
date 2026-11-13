import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { requireStaff, type Staff } from '../lib/auth.js';
import { ensureMethod, HttpError, json, readJson } from '../lib/http.js';
import { applySMTPToVercelAndRedeploy, readVercelSmtpStatus, vercelSMTPEditingReady } from '../services/vercel-smtp.js';
import type { RouteHandler, DatabaseClient } from './context.js';

const allStaffRoles = ['it_administrator', 'super_administrator', 'finance_reviewer', 'department_approver'];
const isValidSecret = (text: string) =>
  text.length >= 14 && /[a-z]/.test(text) && /[A-Z]/.test(text) && /[0-9]/.test(text) && /[^A-Za-z0-9]/.test(text);
const passwordSchema = z.string().min(14).max(128).refine(isValidSecret, {
  message: 'Use at least 14 characters, with uppercase, lowercase, a number and a symbol.',
});
const smtpSchema = z.object({
  host: z.string().trim().min(3).max(120).regex(/^[a-zA-Z0-9.-]+$/),
  port: z.coerce.number().int().refine((port) => [465, 587].includes(port)),
  secure: z.boolean(),
  user: z.email().max(160),
  password: z.string().min(8).max(256),
  fromEmail: z.email().max(160),
  senderName: z.string().trim().min(2).max(70).regex(/^[^<>\r\n]+$/),
  operatorPassword: z.string().min(1),
  confirmation: z.literal('APPLY SMTP'),
});

function sessionHash(event: { headers: Record<string, string | undefined> }, secret: string) {
  const jwt = event.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  let session = jwt;
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1] || '', 'base64url').toString('utf8')) as { session_id?: string };
    if (payload.session_id) session = payload.session_id;
  } catch {
    // The JWT was already validated by requireStaff. Use a hash of the JWT as a fallback.
  }
  return createHmac('sha256', secret).update(session).digest('hex');
}

async function writeEvent(db: DatabaseClient, staff: Staff, action: string, targetId?: string, details: Record<string, string | number | boolean> = {}) {
  const event = await db.from('it_security_events').insert({
    actor_user_id: staff.user.id,
    target_user_id: targetId || null,
    action,
    details,
  });
  if (event.error) throw event.error;
}

async function confirmITPassword(db: DatabaseClient, staff: Staff, password: string) {
  if (!staff.user.email) throw new HttpError(409, 'IT account has no email address.');
  // A fresh password check is required before the most sensitive IT changes.
  const result = await db.auth.signInWithPassword({ email: staff.user.email, password });
  if (result.error || result.data.user?.id !== staff.user.id) {
    throw new HttpError(403, 'IT password confirmation failed.');
  }
}

export const handleITRoutes: RouteHandler = async ({ event, route, db, config }) => {
  if (route === 'presence') {
    ensureMethod(event, 'POST');
    const staff = await requireStaff(event, allStaffRoles);
    const input = z.object({
      action: z.enum(['heartbeat', 'logout']).default('heartbeat'),
      path: z.string().max(160).optional(),
    }).parse(readJson(event));
    const hash = sessionHash(event, config.APPROVAL_TOKEN_ENCRYPTION_KEY);
    const existing = await db.from('staff_presence').select('signed_in_at')
      .eq('user_id', staff.user.id).eq('session_hash', hash).maybeSingle();
    if (existing.error) throw existing.error;
    const now = new Date().toISOString();
    if (input.action === 'logout') {
      const update = await db.from('staff_presence').update({ signed_out_at: now, last_seen_at: now })
        .eq('user_id', staff.user.id).eq('session_hash', hash);
      if (update.error) throw update.error;
    } else {
      const update = await db.from('staff_presence').upsert({
        user_id: staff.user.id,
        session_hash: hash,
        signed_in_at: existing.data?.signed_in_at || now,
        last_seen_at: now,
        signed_out_at: null,
        last_path: input.path?.slice(0, 160) || '/admin',
      }, { onConflict: 'user_id,session_hash' });
      if (update.error) throw update.error;
    }
    return json(200, { ok: true });
  }

  if (!route.startsWith('it/')) return undefined;
  const staff = await requireStaff(event, ['it_administrator']);
  const sub = route.slice(3);

  if (sub === 'overview') {
    ensureMethod(event, 'GET');
    const [listed, profiles, roles, presence, notifications, administrators, auditRecent] = await Promise.all([
      db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      db.from('profiles').select('id,email,full_name,department,active,protected_account'),
      db.from('user_roles').select('user_id,role'),
      db.from('staff_presence').select('user_id,signed_in_at,last_seen_at,signed_out_at,last_path').order('last_seen_at', { ascending: false }).limit(300),
      db.from('email_notifications').select('status,created_at,sent_at').order('created_at', { ascending: false }).limit(1000),
      db.from('it_administrators').select('user_id,active'),
      db.from('it_security_events').select('id,action,actor_user_id,target_user_id,occurred_at,details').order('occurred_at', { ascending: false }).limit(20),
    ]);
    if (listed.error) throw listed.error;
    for (const result of [profiles, roles, presence, notifications, administrators, auditRecent]) {
      if (result.error) throw result.error;
    }
    const profileById = new Map((profiles.data || []).map((p) => [p.id, p]));
    const roleById = new Map<string, string[]>();
    for (const row of roles.data || []) roleById.set(row.user_id, [...(roleById.get(row.user_id) || []), row.role]);
    const itIds = new Set((administrators.data || []).filter((row) => row.active).map((row) => row.user_id));
    const users = listed.data.users.map((u) => {
      const profile = profileById.get(u.id);
      return {
        id: u.id,
        email: u.email || profile?.email || '',
        name: profile?.full_name || u.user_metadata?.full_name || 'Staff user',
        department: profile?.department || '',
        roles: itIds.has(u.id) ? ['it_administrator'] : roleById.get(u.id) || [],
        active: profile?.active ?? false,
        protected: profile?.protected_account ?? false,
        lastSignInAt: u.last_sign_in_at || null,
      };
    });
    const now = Date.now();
    const online = (presence.data || []).filter((row) =>
      !row.signed_out_at && now - Date.parse(row.last_seen_at) < 180_000
    ).length;
    const emailCounts = { sent: 0, queued: 0, retry: 0, failed: 0, other: 0 };
    for (const item of notifications.data || []) {
      const key = item.status as keyof typeof emailCounts;
      if (key in emailCounts) emailCounts[key]++;
      else emailCounts.other++;
    }
    return json(200, {
      ok: true,
      users,
      summary: {
        totalUsers: users.length, activeUsers: users.filter((u) => u.active).length,
        onlineSessions: online, emailCounts,
      },
      services: {
        database: 'connected',
        smtp: Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD && config.SMTP_FROM_EMAIL)
          ? 'configured on running deployment' : 'not configured',
        sender: config.SMTP_FROM_EMAIL || 'Not configured',
        vercelApi: vercelSMTPEditingReady() ? 'configured' : 'setup required',
        lastEmailSent: (notifications.data || []).find((n) => n.sent_at)?.sent_at || null,
      },
      recentLogins: (presence.data || []).map((row) => ({
        userId: row.user_id, signedInAt: row.signed_in_at, lastSeenAt: row.last_seen_at,
        signedOutAt: row.signed_out_at, lastPath: row.last_path,
        online: !row.signed_out_at && now - Date.parse(row.last_seen_at) < 180_000,
      })),
      securityEvents: auditRecent.data || [],
    });
  }

  if (sub === 'smtp') {
    if (event.httpMethod === 'GET') {
      // Return only key names, never a password or API token.
      return json(200, { ok: true, ...(await readVercelSmtpStatus()) });
    }
    ensureMethod(event, 'POST');
    const input = smtpSchema.parse(readJson(event));
    await confirmITPassword(db, staff, input.operatorPassword);
    const result = await applySMTPToVercelAndRedeploy({
      host: input.host, port: input.port, secure: input.secure,
      user: input.user, password: input.password,
      fromEmail: input.fromEmail, senderName: input.senderName,
    });
    await writeEvent(db, staff, 'SMTP_CONFIG_UPDATED', undefined, {
      smtpHost: input.host, sender: input.fromEmail, deploymentStarted: result.redeployStarted,
    });
    return json(200, { ok: true, ...result });
  }

  if (sub === 'password-reset') {
    ensureMethod(event, 'POST');
    const input = z.object({
      userId: z.uuid(),
      newPassword: passwordSchema,
      operatorPassword: z.string().min(1),
      confirmation: z.literal('RESET PASSWORD'),
    }).parse(readJson(event));
    if (input.userId === staff.user.id) throw new HttpError(403, 'IT operators cannot reset their own passwords here.');
    const activity = await db.from('it_security_events')
      .select('id', { count: 'exact', head: true }).eq('actor_user_id', staff.user.id)
      .eq('action', 'PASSWORD_RESET').gte('occurred_at', new Date(Date.now() - 3600_000).toISOString());
    if (activity.error) throw activity.error;
    if ((activity.count || 0) >= 5) throw new HttpError(429, 'Password-reset rate limit reached for this IT account.');
    const target = await db.auth.admin.getUserById(input.userId);
    if (target.error || !target.data.user) throw new HttpError(404, 'The selected account was not found.');
    const protectedResult = await db.from('profiles').select('protected_account').eq('id', input.userId).maybeSingle();
    if (protectedResult.error) throw protectedResult.error;
    if (protectedResult.data?.protected_account) throw new HttpError(403, 'Protected operational accounts require a separate recovery process.');
    const otherIT = await db.from('it_administrators').select('active').eq('user_id', input.userId).maybeSingle();
    if (otherIT.error) throw otherIT.error;
    if (otherIT.data?.active) throw new HttpError(403, 'IT accounts cannot reset another IT account here.');
    await confirmITPassword(db, staff, input.operatorPassword);
    const updated = await db.auth.admin.updateUserById(input.userId, { password: input.newPassword });
    if (updated.error) throw new HttpError(409, 'Password reset was rejected by the authentication service.');
    await writeEvent(db, staff, 'PASSWORD_RESET', input.userId);
    return json(200, { ok: true, message: 'Password updated directly. Instruct the user to sign in with the new temporary password and change it promptly.' });
  }

  throw new HttpError(404, 'IT function not found.');
};

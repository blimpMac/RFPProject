import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { requireStaff } from '../../lib/auth.js';
import {
  EMAIL_CHANGE_OTP_DAILY_LIMIT,
  EMAIL_CHANGE_OTP_TTL_SECONDS,
  hashProfileEmailChangeOtp,
  maskEmailAddress,
} from '../../lib/email-change-otp.js';
import { ensureMethod, HttpError, json, readJson } from '../../lib/http.js';
import { normalizeDepartment } from '../../lib/staff-access.js';
import {
  sendFinanceEmailChangeNotice,
  sendProfileEmailChangeOtp,
} from '../../email/profile-email-change.js';
import type { RouteHandler } from '../context.js';

const staffRoles = [
  'it_administrator',
  'super_administrator',
  'finance_reviewer',
  'department_approver',
];

async function ensureEmailAvailable(
  db: Parameters<RouteHandler>[0]['db'],
  userId: string,
  email: string,
) {
  const profileMatch = await db
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .neq('id', userId)
    .limit(1);
  if (profileMatch.error) throw new HttpError(503, 'Could not verify whether this email is available.');
  if (profileMatch.data?.length) throw new HttpError(409, 'That email address is already assigned to another account.');

  // Auth is the source of truth for uniqueness. Page through the full user list
  // rather than checking only the first page and risking a duplicate beyond it.
  for (let page = 1; page <= 100; page += 1) {
    const result = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new HttpError(503, 'Could not verify whether this email is available.');
    const duplicate = result.data.users.find(
      (user) => user.id !== userId && user.email?.trim().toLowerCase() === email,
    );
    if (duplicate) throw new HttpError(409, 'That email address is already assigned to another account.');
    if (result.data.users.length < 1000) return;
  }
  throw new HttpError(503, 'The account directory is too large to verify safely. Contact IT.');
}

async function profileEmail(db: Parameters<RouteHandler>[0]['db'], userId: string) {
  const result = await db.from('profiles').select('email').eq('id', userId).single();
  if (result.error || !result.data?.email) {
    throw new HttpError(409, 'Your account email is not configured. Contact IT.');
  }
  return String(result.data.email).trim().toLowerCase();
}

async function currentAccountEmail(
  db: Parameters<RouteHandler>[0]['db'],
  userId: string,
  authEmail: string | undefined,
) {
  const email = await profileEmail(db, userId);
  if (authEmail?.trim().toLowerCase() !== email) {
    throw new HttpError(409, 'Your login email and staff profile email are not synchronized. Contact IT before changing this address.');
  }
  return email;
}

export const handleProfileRoutes: RouteHandler = async ({ event, route, db }) => {
  if (!['profile/name', 'profile/email/request', 'profile/email/verify'].includes(route)) {
    return undefined;
  }

  const staff = await requireStaff(event, staffRoles);

  if (route === 'profile/name') {
    ensureMethod(event, 'PATCH');
    const input = z.object({ fullName: z.string().trim().min(2).max(160) }).parse(readJson(event));
    const fullName = input.fullName.trim();

    const profile = await db
      .from('profiles')
      .update({ full_name: fullName, updated_at: new Date().toISOString() })
      .eq('id', staff.user.id)
      .select('department')
      .single();
    if (profile.error || !profile.data)
      throw profile.error || new HttpError(404, 'Profile not found.');

    const authUpdate = await db.auth.admin.updateUserById(staff.user.id, {
      user_metadata: { ...staff.user.user_metadata, full_name: fullName, name: fullName },
    });
    if (authUpdate.error) throw new HttpError(409, authUpdate.error.message);

    if (staff.roles.includes('department_approver') && profile.data.department) {
      const legacy = await db
        .from('approvers')
        .update({ approver_name: fullName, updated_at: new Date().toISOString() })
        .eq('normalized_department', normalizeDepartment(profile.data.department))
        .eq('active', true);
      if (legacy.error) throw legacy.error;
    }

    return json(200, { ok: true, fullName });
  }

  if (route === 'profile/email/request') {
    ensureMethod(event, 'POST');
    const input = z
      .object({ newEmail: z.string().trim().email().max(254) })
      .parse(readJson(event));
    const newEmail = input.newEmail.trim().toLowerCase();
    const currentEmail = await currentAccountEmail(db, staff.user.id, staff.user.email);

    if (newEmail === currentEmail) throw new HttpError(400, 'Enter an email address different from your current one.');
    await ensureEmailAvailable(db, staff.user.id, newEmail);

    const otp = String(randomInt(100000, 1_000_000));
    const issued = await db.rpc('issue_profile_email_change_otp', {
      p_user_id: staff.user.id,
      p_new_email: newEmail,
      p_otp_hash: hashProfileEmailChangeOtp(otp),
    });
    if (issued.error) {
      if (issued.error.message.includes('EMAIL_CHANGE_DAILY_LIMIT')) {
        throw new HttpError(429, 'You have reached the limit of 3 email verification codes for today. Try again tomorrow.');
      }
      throw issued.error;
    }

    try {
      // Finance receives a separate process notification with a masked address.
      // The OTP itself is delivered only to the proposed email address.
      await sendFinanceEmailChangeNotice({
        actorEmail: currentEmail,
        maskedAddress: maskEmailAddress(newEmail),
        event: 'verification_requested',
      });
      await sendProfileEmailChangeOtp(newEmail, otp);
    } catch {
      throw new HttpError(503, 'The verification email could not be sent. Check the address or contact IT before trying again.');
    }

    return json(200, {
      ok: true,
      expiresInSeconds: EMAIL_CHANGE_OTP_TTL_SECONDS,
      dailyLimit: EMAIL_CHANGE_OTP_DAILY_LIMIT,
    });
  }

  ensureMethod(event, 'POST');
  const input = z.object({ otp: z.string().regex(/^\d{6}$/) }).parse(readJson(event));
  const verified = await db.rpc('verify_profile_email_change_otp', {
    p_user_id: staff.user.id,
    p_otp_hash: hashProfileEmailChangeOtp(input.otp),
  });
  if (verified.error) throw verified.error;

  const challenge = Array.isArray(verified.data) ? verified.data[0] : verified.data;
  const status = challenge?.status as string | undefined;
  if (status === 'invalid') throw new HttpError(400, 'That verification code is incorrect.');
  if (status === 'expired') throw new HttpError(410, 'That verification code has expired. Request a new one.');
  if (status === 'locked') throw new HttpError(429, 'Too many incorrect codes were entered. Request a new verification code.');
  if (status === 'used') throw new HttpError(409, 'That verification code has already been used. Request a new one.');
  if (status !== 'verified' || typeof challenge?.new_email !== 'string') {
    throw new HttpError(400, 'No active email verification was found. Request a new code.');
  }

  const newEmail = challenge.new_email.trim().toLowerCase();
  const oldEmail = await currentAccountEmail(db, staff.user.id, staff.user.email);
  if (newEmail === oldEmail) throw new HttpError(400, 'This email address is already set on your account.');
  await ensureEmailAvailable(db, staff.user.id, newEmail);

  // Keep profiles.email and auth.users.email synchronized. Update the profile
  // first, then Auth; if Auth rejects the change, compensate by restoring the
  // profile value before reporting failure.
  const profileUpdate = await db
    .from('profiles')
    .update({ email: newEmail, updated_at: new Date().toISOString() })
    .eq('id', staff.user.id)
    .select('id')
    .maybeSingle();
  if (profileUpdate.error || !profileUpdate.data) {
    throw new HttpError(500, 'Your profile email could not be updated. No Auth email change was made.');
  }

  const authUpdate = await db.auth.admin.updateUserById(staff.user.id, {
    email: newEmail,
    email_confirm: true,
  });
  if (authUpdate.error || !authUpdate.data.user) {
    const rollback = await db
      .from('profiles')
      .update({ email: oldEmail, updated_at: new Date().toISOString() })
      .eq('id', staff.user.id);
    if (rollback.error) {
      console.error('Profile email rollback failed; manual account reconciliation is required.');
      throw new HttpError(500, 'Email synchronization needs IT assistance. Contact IT before signing out.');
    }
    throw new HttpError(409, 'The new email address could not be applied to your login. Your existing email remains active.');
  }

  let financeNotified = true;
  try {
    await sendFinanceEmailChangeNotice({
      actorEmail: oldEmail,
      maskedAddress: maskEmailAddress(newEmail),
      previousAddress: maskEmailAddress(oldEmail),
      event: 'email_changed',
    });
  } catch {
    financeNotified = false;
    console.error('Finance email-change notification could not be delivered.');
  }

  return json(200, { ok: true, email: newEmail, financeNotified });
};

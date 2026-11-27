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

// Self-service profile maintenance is available to every active staff role.
// IT administrators are represented by the separate it_administrators table.
const staffRoles = [
  'it_administrator',
  'super_administrator',
  'administrator',
  'finance_reviewer',
  'finance_head',
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
  if (profileMatch.data?.length) {
    throw new HttpError(409, 'That email address is already assigned to another staff profile.');
  }

  // Auth is the source of truth for uniqueness. Check all pages rather than
  // only the first page so a duplicate cannot hide beyond the result limit.
  for (let page = 1; page <= 100; page += 1) {
    const result = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new HttpError(503, 'Could not verify whether this email is available.');
    const users = result.data.users as unknown as Array<{ id: string; email?: string | null }>;
    const duplicate = users.find(
      (user) => user.id !== userId && user.email?.trim().toLowerCase() === email,
    );
    if (duplicate) throw new HttpError(409, 'That email address is already assigned to another login.');
    if (users.length < 1000) return;
  }
  throw new HttpError(503, 'The account directory is too large to verify safely. Contact IT.');
}

async function profileEmail(db: Parameters<RouteHandler>[0]['db'], userId: string) {
  const result = await db.from('profiles').select('email').eq('id', userId).single();
  if (result.error || !result.data) {
    throw new HttpError(409, 'Your staff profile is not configured. Contact IT.');
  }
  return typeof result.data.email === 'string' ? result.data.email.trim().toLowerCase() : '';
}

/**
 * Auth is canonical for the login identity. A stale profiles.email value must
 * not prevent an already-authenticated staff member from verifying a new one.
 * The verify route synchronizes the profile after the new mailbox is proven.
 */
async function currentAccountEmail(
  db: Parameters<RouteHandler>[0]['db'],
  userId: string,
  authEmail: string | undefined,
) {
  const normalizedAuthEmail = authEmail?.trim().toLowerCase();
  if (normalizedAuthEmail) return normalizedAuthEmail;
  const email = await profileEmail(db, userId);
  if (!email) throw new HttpError(409, 'Your account email is not configured. Contact IT.');
  return email;
}

async function updateProfileEmail(
  db: Parameters<RouteHandler>[0]['db'],
  userId: string,
  email: string,
) {
  const result = await db
    .from('profiles')
    .update({ email, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id')
    .maybeSingle();
  if (result.error || !result.data) {
    throw new HttpError(500, 'Your staff profile email could not be synchronized. Contact IT.');
  }
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

    if (newEmail === currentEmail) {
      throw new HttpError(400, 'Enter an email address different from your current login email.');
    }
    await ensureEmailAvailable(db, staff.user.id, newEmail);

    const otp = String(randomInt(100000, 1_000_000));
    const otpHash = hashProfileEmailChangeOtp(otp);
    const issued = await db.rpc('issue_profile_email_change_otp', {
      p_user_id: staff.user.id,
      p_new_email: newEmail,
      p_otp_hash: otpHash,
    });
    if (issued.error) {
      if (issued.error.message.includes('EMAIL_CHANGE_DAILY_LIMIT')) {
        throw new HttpError(429, 'You have reached the limit of 3 email verification codes for today. Try again tomorrow.');
      }
      throw new HttpError(503, 'A verification code could not be created. Please try again or contact IT.');
    }

    try {
      // This is the only recipient of the code: the mailbox the user is
      // requesting to use as their new RFP login.
      await sendProfileEmailChangeOtp(newEmail, otp);
    } catch {
      await db
        .from('profile_email_change_otps')
        .update({ consumed_at: new Date().toISOString() })
        .eq('user_id', staff.user.id)
        .eq('otp_hash', otpHash)
        .is('consumed_at', null);
      console.error('Profile email OTP delivery failed; the challenge was invalidated.');
      throw new HttpError(503, 'The verification code could not be delivered to the new email address. Check the address or contact IT.');
    }

    let financeNotified = true;
    try {
      await sendFinanceEmailChangeNotice({
        actorEmail: currentEmail,
        maskedAddress: maskEmailAddress(newEmail),
        event: 'verification_requested',
      });
    } catch {
      financeNotified = false;
      console.error('Finance email-change request notification could not be delivered.');
    }

    return json(200, {
      ok: true,
      sentTo: newEmail,
      expiresInSeconds: EMAIL_CHANGE_OTP_TTL_SECONDS,
      dailyLimit: EMAIL_CHANGE_OTP_DAILY_LIMIT,
      financeNotified,
    });
  }

  ensureMethod(event, 'POST');
  const input = z.object({ otp: z.string().regex(/^\d{6}$/) }).parse(readJson(event));
  const otpHash = hashProfileEmailChangeOtp(input.otp);
  const verified = await db.rpc('verify_profile_email_change_otp', {
    p_user_id: staff.user.id,
    p_otp_hash: otpHash,
  });
  if (verified.error) throw new HttpError(503, 'The verification service could not validate this code. Try again.');

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
  const oldAuthEmail = await currentAccountEmail(db, staff.user.id, staff.user.email);
  const oldProfileEmail = await profileEmail(db, staff.user.id);

  if (newEmail !== oldAuthEmail) {
    await ensureEmailAvailable(db, staff.user.id, newEmail);

    // Update the actual login identity first. Supabase's admin update applies
    // directly without triggering a second confirmation email; the custom OTP
    // above is the proof that the user controls the new mailbox.
    const authUpdate = await db.auth.admin.updateUserById(staff.user.id, {
      email: newEmail,
      email_confirm: true,
    });
    if (authUpdate.error || !authUpdate.data.user) {
      throw new HttpError(409, 'The new email could not be applied to your login. Your existing email remains active. You can retry with the same code while it is valid.');
    }
  }

  // Also repairs profiles.email if it was already out of sync with Auth.
  try {
    if (oldProfileEmail !== newEmail) {
      await updateProfileEmail(db, staff.user.id, newEmail);
    }
  } catch (profileError) {
    if (newEmail !== oldAuthEmail) {
      const rollback = await db.auth.admin.updateUserById(staff.user.id, {
        email: oldAuthEmail,
        email_confirm: true,
      });
      if (rollback.error) {
        console.error('Auth email rollback failed; manual account reconciliation is required.');
        throw new HttpError(500, 'The login email changed but the staff profile could not be synchronized. Contact IT immediately.');
      }
    }
    throw profileError;
  }

  // Consume only after both Auth and public.profiles are synchronized. If this
  // final bookkeeping call fails, the same verified OTP can safely be retried.
  const consumed = await db.rpc('consume_profile_email_change_otp', {
    p_user_id: staff.user.id,
    p_otp_hash: otpHash,
  });
  const verificationConsumed = !consumed.error && consumed.data === true;
  if (!verificationConsumed) {
    console.error('Email change completed, but OTP consumption needs reconciliation.');
  }

  let financeNotified = true;
  try {
    await sendFinanceEmailChangeNotice({
      actorEmail: oldAuthEmail,
      maskedAddress: maskEmailAddress(newEmail),
      previousAddress: maskEmailAddress(oldAuthEmail),
      event: 'email_changed',
    });
  } catch {
    financeNotified = false;
    console.error('Finance email-change notification could not be delivered.');
  }

  return json(200, {
    ok: true,
    email: newEmail,
    financeNotified,
    verificationConsumed,
  });
};

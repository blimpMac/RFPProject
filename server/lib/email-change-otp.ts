import crypto from 'node:crypto';

export const EMAIL_CHANGE_OTP_TTL_SECONDS = 10 * 60;
export const EMAIL_CHANGE_OTP_DAILY_LIMIT = 3;
export const EMAIL_CHANGE_OTP_MAX_ATTEMPTS = 5;

export function hashProfileEmailChangeOtp(otp: string) {
  const key = process.env.APPROVAL_TOKEN_ENCRYPTION_KEY;
  if (!key || Buffer.byteLength(key, 'utf8') < 32) {
    throw new Error('The email verification hashing key is not configured.');
  }
  return crypto
    .createHmac('sha256', key)
    .update(`rfp-profile-email-change:v1:${otp}`, 'utf8')
    .digest('hex');
}

export function maskEmailAddress(value: string) {
  const [local, domain] = value.trim().split('@');
  if (!local || !domain) return 'hidden address';
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(2, Math.min(8, local.length - visible.length)))}@${domain}`;
}

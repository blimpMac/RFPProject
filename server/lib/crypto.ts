import crypto from 'node:crypto';

export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export const clientHash = (ip: string) =>
  crypto
    .createHmac('sha256', process.env.APPROVAL_TOKEN_ENCRYPTION_KEY || 'unconfigured')
    .update(ip)
    .digest('hex');
function encryptionKey() {
  return crypto
    .createHash('sha256')
    .update(process.env.APPROVAL_TOKEN_ENCRYPTION_KEY || '')
    .digest();
}
export function seal(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}
export function openSealed(value: string) {
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !encrypted) throw new Error('Encrypted queue credential is invalid');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

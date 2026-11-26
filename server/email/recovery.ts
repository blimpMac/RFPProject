import nodemailer from 'nodemailer';
import { config } from '../lib/config.js';
import {
  recoveryFromAddress,
  recoverySourceRecipients,
  recoverySubject,
  renderRecoveryEmail,
} from './recovery-template.js';

export type RecoveryDeliveryResult = {
  messageId: string;
  response: string;
  sourceRecipients: string[];
  acceptedRecipients: string[];
  rejectedRecipients: string[];
};

function normalizeMailboxes(values: unknown[]): string[] {
  return values
    .map((value) => {
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object' && 'address' in value) {
        return String((value as { address?: unknown }).address || '');
      }
      return '';
    })
    .filter(Boolean)
    .map((address) => address.trim().toLowerCase());
}

/**
 * Sends a branded recovery message and returns SMTP envelope results so the
 * caller can distinguish recipient acceptance from a missing source-mail copy.
 * Recovery links are never logged or returned from this module.
 */
export async function sendBrandedRecoveryEmail(
  recipient: string,
  actionLink: string,
): Promise<RecoveryDeliveryResult> {
  const c = config();
  if (!c.SMTP_HOST || !c.SMTP_USER || !c.SMTP_PASSWORD || !c.SMTP_FROM_EMAIL) {
    throw new Error('SMTP recovery delivery is not configured');
  }

  const from = recoveryFromAddress(c.SMTP_FROM_EMAIL);
  const sourceRecipients = recoverySourceRecipients(
    c.SMTP_USER,
    c.SMTP_FROM_EMAIL,
    recipient,
  );
  const transport = nodemailer.createTransport({
    host: c.SMTP_HOST,
    port: c.SMTP_PORT,
    secure: c.SMTP_SECURE,
    auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  try {
    const result = await transport.sendMail({
      from,
      to: recipient,
      bcc: sourceRecipients,
      subject: recoverySubject,
      html: renderRecoveryEmail(actionLink),
      text: `RFP Monitoring System — Reset your password

Use the following secure link to set a new password:

${actionLink}

If you did not request this, ignore this email. Never share your password or recovery link.`,
    });

    return {
      messageId: result.messageId || '',
      response: String(result.response || '').slice(0, 1000),
      sourceRecipients,
      acceptedRecipients: normalizeMailboxes(result.accepted || []),
      rejectedRecipients: normalizeMailboxes(result.rejected || []),
    };
  } finally {
    transport.close();
  }
}

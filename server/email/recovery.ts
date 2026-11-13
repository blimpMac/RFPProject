import nodemailer from 'nodemailer';
import { config } from '../lib/config.js';

import { recoveryFromAddress, recoverySubject, renderRecoveryEmail } from './recovery-template.js';

/** Uses existing, server-only RFP SMTP credentials. Never logs or returns the token link. */
export async function sendBrandedRecoveryEmail(recipient: string, actionLink: string) {
  const c = config();
  if (!c.SMTP_HOST || !c.SMTP_USER || !c.SMTP_PASSWORD || !c.SMTP_FROM_EMAIL) {
    throw new Error('SMTP recovery delivery is not configured');
  }
  const transport = nodemailer.createTransport({
    host: c.SMTP_HOST,
    port: c.SMTP_PORT,
    secure: c.SMTP_SECURE,
    auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD },
  });
  try {
    await transport.sendMail({
      from: recoveryFromAddress(c.SMTP_FROM_EMAIL),
      to: recipient,
      subject: recoverySubject,
      html: renderRecoveryEmail(actionLink),
      text: 'A password-reset request was made for your RFP Monitoring System account. Use the secure link in the HTML email. If you did not request this, ignore it.',
    });
  } finally {
    transport.close();
  }
}

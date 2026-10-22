import process from 'node:process';
import nodemailer from 'nodemailer';
import {
  emailTemplateKeys,
  renderEmailPreview,
  type EmailTemplateKey,
} from '../../server/email/templates.js';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 465);
const secure = (process.env.SMTP_SECURE || 'true') === 'true';
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASSWORD;
const from = process.env.SMTP_FROM_EMAIL;
const recipient = process.env.TEST_EMAIL_RECIPIENT || process.env.ADMIN_BOOTSTRAP_EMAIL;
const requestedTemplate = process.env.TEST_EMAIL_TEMPLATE || 'supervisor_review';

if (!host || !user || !pass || !from)
  throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL are required.');
if (!recipient)
  throw new Error('Set TEST_EMAIL_RECIPIENT or ADMIN_BOOTSTRAP_EMAIL to receive the test.');
if (!emailTemplateKeys.includes(requestedTemplate as EmailTemplateKey))
  throw new Error(`Unknown TEST_EMAIL_TEMPLATE: ${requestedTemplate}`);

const transport = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
await transport.verify();
const rendered = renderEmailPreview(
  requestedTemplate as EmailTemplateKey,
  process.env.SITE_URL || 'https://greenlight-rfp.vercel.app',
);
const result = await transport.sendMail({
  from,
  to: recipient,
  subject: `[PREVIEW] ${rendered.subject}`,
  html: rendered.html,
});
const masked = recipient.replace(/^(.{2}).*(@.*)$/, '$1***$2');
console.log(
  JSON.stringify(
    {
      ok: result.accepted.includes(recipient),
      template: requestedTemplate,
      recipient: masked,
      messageId: result.messageId,
    },
    null,
    2,
  ),
);

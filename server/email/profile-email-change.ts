import nodemailer from 'nodemailer';
import { config } from '../lib/config.js';
import { recoveryFromAddress } from './recovery-template.js';

type FinanceNotice = {
  actorEmail: string;
  maskedAddress: string;
  event: 'verification_requested' | 'email_changed';
  previousAddress?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderProfileEmailChangeOtp(otp: string) {
  const safeOtp = escapeHtml(otp);
  return {
    subject: 'RFP Monitoring System | Verify your new email address',
    text: `Your RFP Monitoring System verification code is ${otp}. It expires in 10 minutes. Enter it only in the RFP website. Never share this code.`,
    html: `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify your email</title></head>
<body style="margin:0;padding:32px 12px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#21384a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#fff;border:1px solid #d9e3e9;border-radius:14px;overflow:hidden">
<tr><td style="background:#0b2232;padding:26px 30px;color:#fff;font-size:20px;font-weight:800">RFP Monitoring System</td></tr>
<tr><td style="padding:32px 30px">
<p style="margin:0 0 10px;color:#167b70;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">Account security</p>
<h1 style="margin:0 0 14px;font-size:25px;color:#102a3a">Verify your new email</h1>
<p style="font-size:15px;line-height:24px;color:#40596b">Enter this one-time code in the Edit Profile section of your RFP workspace to confirm that you can access this mailbox.</p>
<div style="margin:26px 0;padding:20px;text-align:center;border-radius:10px;background:#f0f6f5;border:1px solid #d6e8e5">
<div style="font-size:32px;letter-spacing:9px;font-weight:800;color:#164b4c;font-family:monospace">${safeOtp}</div>
</div>
<p style="font-size:14px;line-height:22px;color:#40596b">This code expires in <strong>10 minutes</strong> and can be used only once. Do not forward or share it with anyone, including Finance or IT personnel.</p>
<p style="font-size:13px;line-height:21px;color:#637987">If you did not request this change, ignore this email. Your existing email address will remain on your account.</p>
</td></tr><tr><td style="padding:20px 30px;background:#f8fafb;border-top:1px solid #e8edf0;font-size:12px;line-height:19px;color:#637987">RFP Monitoring System — automated account-security message.</td></tr>
</table></td></tr></table></body></html>`,
  };
}

export function renderFinanceEmailChangeNotice(notice: FinanceNotice) {
  const eventLabel =
    notice.event === 'email_changed' ? 'Email address successfully changed' : 'Email verification requested';
  const rows: [string, string][] = [
    ['Event', eventLabel],
    ['Account', notice.actorEmail],
    ['New address', notice.maskedAddress],
    ...(notice.previousAddress ? [['Previous address', notice.previousAddress] as [string, string]] : []),
    ['Time', new Date().toISOString()],
  ];
  const safeRows = rows
    .map(([label, value]) => `<tr><td style="padding:8px 10px;color:#64748b;font-size:13px">${escapeHtml(label)}</td><td style="padding:8px 10px;color:#1e293b;font-size:13px;font-weight:600">${escapeHtml(value)}</td></tr>`)
    .join('');
  return {
    subject: `RFP Monitoring System | ${eventLabel}`,
    text: [
      'RFP Monitoring System — account event',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      'Security note: the one-time verification code and any verification credentials are intentionally excluded from this notification.',
    ].join('\n'),
    html: `<!doctype html><html lang="en"><body style="margin:0;padding:28px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#21384a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #d9e3e9;border-radius:12px;overflow:hidden">
<tr><td style="padding:22px 26px;background:#0b2232;color:#fff;font-size:19px;font-weight:800">RFP Monitoring System</td></tr>
<tr><td style="padding:26px"><h1 style="margin:0 0 18px;font-size:21px;color:#102a3a">${escapeHtml(eventLabel)}</h1>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${safeRows}</table>
<p style="margin:20px 0 0;padding:14px;background:#f0f6f5;border-radius:8px;color:#40596b;font-size:12px;line-height:19px">The one-time verification code and verification credentials are intentionally excluded from this notification. The actual code is sent only to the proposed email address.</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}

function smtp() {
  const c = config();
  if (!c.SMTP_HOST || !c.SMTP_USER || !c.SMTP_PASSWORD || !c.SMTP_FROM_EMAIL) {
    throw new Error('SMTP configuration is incomplete');
  }
  const transport = nodemailer.createTransport({
    host: c.SMTP_HOST,
    port: c.SMTP_PORT,
    secure: c.SMTP_SECURE,
    auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return { transport, from: recoveryFromAddress(c.SMTP_FROM_EMAIL) };
}

function wasAccepted(result: nodemailer.SentMessageInfo, address: string) {
  const mailboxes = (result.accepted || []).map((item) =>
    typeof item === 'string' ? item.toLowerCase() : String(item.address || '').toLowerCase(),
  );
  return mailboxes.includes(address.toLowerCase());
}

/** Sends the code exclusively to the proposed mailbox; no CC or BCC is used. */
export async function sendProfileEmailChangeOtp(recipient: string, otp: string) {
  const { transport, from } = smtp();
  const rendered = renderProfileEmailChangeOtp(otp);
  try {
    const result = await transport.sendMail({
      from,
      to: recipient,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    if (!wasAccepted(result, recipient)) throw new Error('SMTP did not accept the verification recipient.');
    return { messageId: result.messageId || '' };
  } finally {
    transport.close();
  }
}

/** Sends a separate process notice to the configured SMTP sender mailbox, never the OTP. */
export async function sendFinanceEmailChangeNotice(notice: FinanceNotice) {
  const { transport, from } = smtp();
  const rendered = renderFinanceEmailChangeNotice(notice);
  const recipient = from.address;
  try {
    const result = await transport.sendMail({
      from,
      to: recipient,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    if (!wasAccepted(result, recipient)) throw new Error('SMTP did not accept the Finance notification recipient.');
    return { messageId: result.messageId || '' };
  } finally {
    transport.close();
  }
}

export const recoverySubject = 'RFP Monitoring System | Reset your password';

/** Escapes the token-bearing Supabase link for a quoted HTML attribute. */
function escapeAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Parse a plain mailbox address or a standard "Display Name <address>" value. */
function mailboxAddress(value: string) {
  const bracketed = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  const address = (bracketed?.[1] || value).trim();
  if (!/^[^\s@<>]+@[^\s@<>]+[.][^\s@<>]+$/.test(address)) {
    throw new Error('SMTP mailbox address is invalid');
  }
  return address;
}

/** Keep the authorized SMTP From address; replace only its display name. */
export function recoveryFromAddress(configuredFrom: string) {
  return { name: 'RFP Monitoring System', address: mailboxAddress(configuredFrom) };
}

/**
 * Copy recovery mail to both the authenticated SMTP mailbox and the configured
 * From mailbox. Remove duplicates and avoid addressing the requestor twice.
 */
export function recoverySourceRecipients(
  smtpUser: string,
  configuredFrom: string,
  requestorEmail: string,
) {
  const requestor = requestorEmail.trim().toLowerCase();
  const recipients = new Map<string, string>();
  for (const candidate of [smtpUser, configuredFrom]) {
    try {
      const address = mailboxAddress(candidate);
      const key = address.toLowerCase();
      if (key !== requestor && !recipients.has(key)) recipients.set(key, address);
    } catch {
      // SMTP usernames are not always mailbox addresses; a valid From mailbox
      // remains a required source-copy destination.
    }
  }
  return [...recipients.values()];
}

export function renderRecoveryEmail(actionLink: string) {
  const link = new URL(actionLink);
  if (link.protocol !== 'https:') throw new Error('An HTTPS recovery URL is required.');
  const safeLink = escapeAttribute(link.toString());

  return `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RFP Monitoring System — Reset your password</title></head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#21384a">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">A secure password recovery link for your RFP Monitoring System account.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9">
      <tr><td align="center" style="padding:36px 14px 44px">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;border:1px solid #d9e3e9;border-radius:16px;overflow:hidden;background:#ffffff">
          <tr><td style="background:#0b2232;padding:30px 34px">
            <div style="font-size:21px;line-height:28px;font-weight:800;color:#ffffff">RFP Monitoring System</div>
          </td></tr>
          <tr><td style="padding:36px 34px 30px">
            <p style="margin:0 0 10px;color:#167b70;font-size:11px;font-weight:800;letter-spacing:1.7px;text-transform:uppercase">Account security</p>
            <h1 style="margin:0 0 16px;font-size:27px;line-height:34px;color:#102a3a">Reset your password</h1>
            <p style="margin:0 0 14px;font-size:15px;line-height:24px;color:#40596b">We received a request to reset the password for your RFP Monitoring System account.</p>
            <p style="margin:0 0 28px;font-size:15px;line-height:24px;color:#40596b">Use the button below to securely create a new password.</p>
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:9px;background:#156b62">
              <a href="${safeLink}" style="display:inline-block;border-radius:9px;padding:15px 26px;font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none" target="_blank" rel="noopener noreferrer">Reset my password</a>
            </td></tr></table>
            <div style="margin-top:30px;padding:16px 18px;background:#f0f6f5;border:1px solid #d6e8e5;border-radius:9px">
              <p style="margin:0;font-size:13px;line-height:21px;color:#3d5964"><strong style="color:#164b4c">Didn't request this?</strong><br>You can safely ignore this email. Your password will not change unless the secure link is used.</p>
            </div>
          </td></tr>
          <tr><td style="border-top:1px solid #e8edf0;background:#f8fafb;padding:22px 34px">
            <p style="margin:0;font-size:12px;line-height:19px;color:#637987">RFP Monitoring System. Never reply with your password or forward this recovery email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

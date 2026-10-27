import nodemailer from 'nodemailer';
import type { User } from '@supabase/supabase-js';
import { config } from '../lib/config.js';
import { HttpError } from '../lib/http.js';
import { adminClient } from '../lib/supabase.js';
import { isEmailDeliveryConfigured } from './service.js';

type DatabaseClient = ReturnType<typeof adminClient>;
type AccessLevel = 'staff' | 'approver';

type StaffInvitationInput = {
  email: string;
  fullName: string;
  department: string;
  accessLevel: AccessLevel;
};

type StaffInvitationEmailInput = StaffInvitationInput & {
  inviteUrl: string;
  siteUrl: string;
};

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!,
  );

function accessLabel(accessLevel: AccessLevel) {
  return accessLevel === 'approver' ? 'Department Head' : 'Finance Member';
}

export function renderStaffInvitationEmail(input: StaffInvitationEmailInput) {
  const role = accessLabel(input.accessLevel);
  const inviteUrl = escapeHtml(input.inviteUrl);
  const greenlightLogo = escapeHtml(`${input.siteUrl}/brands/greenlight-power.png`);
  const gemcorLogo = escapeHtml(`${input.siteUrl}/brands/gemcor.png`);
  const subject = 'RFP Monitoring System access invitation';
  const preheader = `You have been invited as ${role} for ${input.department}.`;

  const html = `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light only">
  </head>
  <body style="margin:0;background:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#172033">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f6">
      <tr>
        <td align="center" style="padding:36px 12px">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #d8e0e8;border-radius:16px;overflow:hidden;box-shadow:0 10px 32px rgba(16,42,67,.10)">
            <tr><td style="height:6px;background:#2f855a;font-size:0">&nbsp;</td></tr>
            <tr>
              <td style="padding:22px 28px 18px;background:#ffffff;border-bottom:1px solid #e5eaf0">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="middle" style="width:50%;padding-right:12px">
                      <img src="${greenlightLogo}" alt="Greenlight Power Inc." style="display:block;max-width:165px;max-height:48px;width:auto;height:auto">
                    </td>
                    <td valign="middle" align="right" style="width:50%;padding-left:12px">
                      <img src="${gemcorLogo}" alt="GEMCOR" style="display:inline-block;max-width:145px;max-height:48px;width:auto;height:auto">
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px;background:#102a43;color:#ffffff">
                <div style="font-size:12px;letter-spacing:.11em;text-transform:uppercase;color:#b9c8d8;font-weight:700">Greenlight Power × GEMCOR</div>
                <div style="margin-top:6px;font-size:20px;font-weight:800;line-height:1.3">RFP Monitoring System</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 30px">
                <h1 style="margin:0 0 14px;font-size:25px;line-height:1.25;color:#102a43">You’re invited to access the RFP system</h1>
                <p style="margin:0 0 20px;color:#526174;font-size:15px;line-height:1.65">An account has been prepared for you to securely access the Request for Payment monitoring workflow.</p>

                <div style="margin:22px 0;padding:18px;border:1px solid #dfe6ed;border-radius:10px;background:#f8fafc">
                  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#718096;font-weight:700;margin-bottom:12px">Your access</div>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px">
                    <tr><td style="padding:7px 0;color:#718096;width:34%">Name</td><td style="padding:7px 0;font-weight:700;color:#172033">${escapeHtml(input.fullName)}</td></tr>
                    <tr><td style="padding:7px 0;color:#718096">Email</td><td style="padding:7px 0;font-weight:700;color:#172033">${escapeHtml(input.email)}</td></tr>
                    <tr><td style="padding:7px 0;color:#718096">Role</td><td style="padding:7px 0;font-weight:700;color:#172033">${escapeHtml(role)}</td></tr>
                    <tr><td style="padding:7px 0;color:#718096">Department</td><td style="padding:7px 0;font-weight:700;color:#172033">${escapeHtml(input.department)}</td></tr>
                  </table>
                </div>

                <p style="margin:24px 0 18px">
                  <a href="${inviteUrl}" style="display:inline-block;background:#2f855a;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:8px;font-size:15px;font-weight:800">Accept invitation &amp; set password</a>
                </p>

                <div style="margin-top:22px;padding:14px 16px;border-left:4px solid #315c93;background:#f2f6fb;color:#526174;font-size:13px;line-height:1.6">
                  This is a secure, single-use invitation link. Its validity follows the authentication expiry configured for the RFP system. If the link has expired, contact the Super Administrator for a new invitation.
                </div>

                <p style="margin:24px 0 8px;color:#667085;font-size:12px;line-height:1.55">If the button does not open, copy and paste this address into your browser:</p>
                <p style="margin:0;padding:12px 14px;background:#f7f9fb;border:1px solid #e3e8ee;border-radius:8px;color:#315c93;font-size:12px;line-height:1.55;word-break:break-all">${inviteUrl}</p>

                <p style="margin:24px 0 0;color:#667085;font-size:12px;line-height:1.55">If you were not expecting this invitation, you can ignore this email.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f7f9fb;border-top:1px solid #e4e9ef;color:#667085;font-size:12px;line-height:1.55">
                <strong style="color:#102a43">RFP Monitoring System</strong><br>
                Greenlight Power Inc. &bull; Greenmetal Electric Manufacturing Corp.<br>
                <span style="color:#8793a3">Secure internal access invitation</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    'RFP Monitoring System',
    'Greenlight Power × GEMCOR',
    '',
    'You have been invited to access the Request for Payment monitoring workflow.',
    '',
    `Name: ${input.fullName}`,
    `Email: ${input.email}`,
    `Role: ${role}`,
    `Department: ${input.department}`,
    '',
    'Accept the invitation and set your password:',
    input.inviteUrl,
    '',
    'This secure link is single-use and expires according to the authentication settings of the RFP system.',
    'If you were not expecting this invitation, you can ignore this email.',
  ].join('\n');

  return { subject, html, text };
}

async function sendBrandedInvitation(input: StaffInvitationEmailInput) {
  const c = config();
  if (!c.SMTP_HOST || !c.SMTP_USER || !c.SMTP_PASSWORD || !c.SMTP_FROM_EMAIL) {
    throw new Error('SMTP configuration is incomplete');
  }

  const transport = nodemailer.createTransport({
    host: c.SMTP_HOST,
    port: c.SMTP_PORT,
    secure: c.SMTP_SECURE,
    auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD },
  });
  const rendered = renderStaffInvitationEmail(input);
  await transport.sendMail({
    from: c.SMTP_FROM_EMAIL,
    to: input.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

export async function inviteStaffUser(
  db: DatabaseClient,
  input: StaffInvitationInput,
): Promise<User> {
  const c = config();
  const redirectTo = `${c.SITE_URL}/admin/reset-password`;
  const metadata = {
    full_name: input.fullName,
    department: input.department,
    access_level: input.accessLevel,
  };

  if (!isEmailDeliveryConfigured()) {
    const invited = await db.auth.admin.inviteUserByEmail(input.email, {
      redirectTo,
      data: metadata,
    });
    if (invited.error || !invited.data.user) {
      throw new HttpError(409, invited.error?.message || 'Unable to create the invited account.');
    }
    return invited.data.user;
  }

  const generated = await db.auth.admin.generateLink({
    type: 'invite',
    email: input.email,
    options: { redirectTo, data: metadata },
  });
  if (generated.error || !generated.data.user || !generated.data.properties?.action_link) {
    throw new HttpError(409, generated.error?.message || 'Unable to create the invitation link.');
  }

  try {
    await sendBrandedInvitation({
      ...input,
      inviteUrl: generated.data.properties.action_link,
      siteUrl: c.SITE_URL,
    });
  } catch (cause) {
    await db.auth.admin.deleteUser(generated.data.user.id);
    console.error('Branded staff invitation delivery failed.', cause);
    throw new HttpError(
      503,
      'The account invitation could not be delivered. Please verify the email configuration and try again.',
    );
  }

  return generated.data.user;
}

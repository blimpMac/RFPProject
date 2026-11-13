# RFP Monitoring System — branded password recovery

This procedure configures **Supabase Auth's reset-password email**, which is
separate from the ordinary RFP workflow notifications sent by Vercel/Nodemailer.

## What this repository already changes

- Password recovery request page: `/admin/forgot-password`, branded for the
  **RFP Monitoring System — GPI / GEMCOR**, with a responsive form and a
  non-enumerating success confirmation.
- Set-new-password page: `/admin/reset-password`, with a matching branded
  design, password visibility toggles and password-confirmation feedback.
- Auth recovery email HTML template: `supabase/templates/recovery.html`.
- Local Supabase Auth template configuration: `supabase/config.toml`.

**IMPORTANT:** Updating these GitHub files does **not** change the email that
the hosted Supabase project currently sends. The hosted project's Auth template
and sender are configured separately in Supabase. Never paste an Auth service
key, an SMTP password or an email recovery link into GitHub or ChatGPT.

## Production Supabase project

RFP Web Project: `chchtjolsnlelgxbgkip`

1. Go to the [RFP Supabase project](https://supabase.com/dashboard/project/chchtjolsnlelgxbgkip).
2. Open **Authentication → SMTP Settings** (the layout may be titled
   Authentication Settings). Configure an **authorized custom SMTP service**:
   host, port, account email/username, app password and approved From address.
3. Set **Sender name** to **RFP Monitoring System**. This is the actual
   From display name and **cannot be changed from the HTML email template**.
4. Verify the sending account/domain is authorized, including provider-required
   SPF, DKIM and DMARC records. Save settings and send a test through approved
   Supabase Auth test facilities.

The RFP Supabase organization is on the **Free plan** and this project was
created after June 3, 2026. For newer Free projects, Supabase requires a
**custom SMTP provider** before it will allow customized Auth email templates.
If the template editor is locked, complete SMTP setup first.

The website's separate **IT Dashboard → SMTP sender** feature updates
`SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM_EMAIL` for RFP workflow
notifications in **Vercel**. It does **not** configure Supabase Auth's email
transport or sender name.

## Apply the hosted password-reset template

1. Open [RFP Supabase Auth Email Templates](https://supabase.com/dashboard/project/chchtjolsnlelgxbgkip/auth/templates).
2. Select **Reset Password** / **Recovery** (not Magic Link or Invite).
3. Change the subject to exactly:
   `RFP Monitoring System | Reset your password`
4. Copy the entire contents of
   [supabase/templates/recovery.html](../supabase/templates/recovery.html)
   into the HTML Body editor and save.
5. Do **not** replace `{{ .ConfirmationURL }}`. Supabase replaces that
   placeholder with the user's secure, one-time recovery URL. The email has
   just one password-reset button; never hardcode or log a recovery token.
6. The footer, security message and header will display the RFP Monitoring
   System name instead of a generic Supabase password-recovery message.

The `supabase/config.toml` reference only applies to local Supabase
development / self-hosting. It is **not** uploaded to hosted Auth
automatically when Vercel builds the website.

## Redirect configuration

In Supabase **Authentication → URL Configuration**:

- Site URL: `https://greenlight-rfp.vercel.app`
- Allow Redirect URL: `https://greenlight-rfp.vercel.app/admin/reset-password`

The frontend calls `resetPasswordForEmail` with that URL as `redirectTo`.
Keep the existing Supabase-signed `{{ .ConfirmationURL }}` intact. Never
replace it with a direct unsecured link to the reset form.

## Verification checklist

- Open `https://greenlight-rfp.vercel.app/admin/forgot-password`.
- Use an **approved test staff account** with a real accessible inbox.
- Verify the confirmation screen does not disclose if the email is registered.
- Verify the **From name**, subject, and card branding in the received message.
- Click the secure button and verify it opens `/admin/reset-password`.
- Set a new password, then sign in using the new password from `/admin/login`.
- Verify the earlier password no longer works.
- Check desktop/mobile email rendering and spam-folder placement.
- Do not forward a live reset email or record its token in screenshots/logs.

## If no email arrives

Check Auth SMTP configuration, sender domain authorization, Supabase Auth
rate limits and SMTP logs. Free-tier default SMTP is restricted and may not
deliver to general staff addresses. The RFP workflow email queue is **not**
used for Supabase password reset emails.

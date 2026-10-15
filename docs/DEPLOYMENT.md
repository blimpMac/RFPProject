# Vercel deployment

## Prerequisites

- Existing GitHub repository `blimpMac/RFPProject` with changes pushed normally (never force-push).
- Configured Supabase project with migrations applied.
- Verified SMTP account for workflow email delivery (Gmail requires MFA and an app password where supported).
- Completed migration verification.

## Vercel configuration

1. Import `blimpMac/RFPProject` into Vercel and select the production branch `main`.
2. Keep the framework preset on Vite and Node.js on `24.x`.
3. `vercel.json` supplies the production build, output directory, SPA routes, `/api/*` routing, security headers, and scheduled maintenance jobs.
4. Add the browser and runtime values from [ENVIRONMENT.md](ENVIRONMENT.md). Mark `SUPABASE_SECRET_KEY`, `APPROVAL_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, and SMTP credentials as sensitive.
5. Set both `SITE_URL` and `VITE_SITE_URL` to the exact production origin.
6. Deploy. Environment-variable changes apply only to the next deployment.

The Hobby plan runs each cron at most once per day. The repository therefore schedules email processing and abandoned-upload cleanup daily. Use Vercel Pro or an external scheduler if email queue latency must be shorter.

## Supabase Auth

Set the Supabase Auth site URL to the Vercel production origin and allow these redirect paths:

- `/admin`
- `/admin/login`
- `/admin/reset-password`

The committed `supabase/config.toml` contains the production values and can be applied with `supabase config push --yes`.

## Post-deploy checks

- `/`, `/admin/login`, and `/admin/reset-password` return the SPA without Vercel account authentication.
- `/api/public-config` returns JSON and `/api/me` rejects unauthenticated requests.
- Every staff account can sign in and receives only its configured roles.
- The super administrator can list users and remove only non-protected accounts.
- `/api/monitoring/documents` loads and `/api/attachments/url` issues a working private signed link.
- A small public request can upload an attachment and returns an RFP number.
- The request appears in `/admin/monitoring` and follows the department/finance workflow.
- Workflow email status becomes `sent`, not merely `queued`, after SMTP is configured.
- Direct refreshes work for `/admin`, `/review/:token`, and `/track/:token`.

## Rollback

Vercel can promote a prior production deployment without rewriting database history. Database migrations are forward-only; create a reviewed corrective migration instead of editing a migration already applied to production.

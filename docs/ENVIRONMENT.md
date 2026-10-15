# Environment setup

Store local values only in the ignored `.env` file. Deployment values belong in **Vercel Project Settings -> Environment Variables**. No committed environment sample is maintained; this guide is the canonical variable inventory.

## Browser-safe values

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Current `sb_publishable_...` browser key; this is intentionally public and protected by RLS |
| `VITE_SUPABASE_ANON_KEY` | Optional legacy fallback only |
| `VITE_APP_NAME` | Display name |
| `VITE_SITE_URL` | Exact site origin |

## Server-only secrets

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Same project URL, used by Functions/scripts |
| `SUPABASE_SECRET_KEY` | Current `sb_secret_...` server key; never expose with `VITE_` |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional legacy fallback only |
| `APPROVAL_TOKEN_ENCRYPTION_KEY` | 32+ random characters used to encrypt queued one-time review credentials |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | SMTP connection (Gmail: `smtp.gmail.com`, `465`, `true`) |
| `SMTP_USER`, `SMTP_PASSWORD` | Authorized SMTP account and app password |
| `SMTP_FROM_EMAIL` | Branded sender, e.g. `RFP Desk <notifications@example.com>` |
| `SITE_URL` | Exact deployed origin used in secure links |
| `CRON_SECRET` | Random secret Vercel uses to authorize scheduled maintenance requests |

## Setup/migration-only secrets

- `SUPABASE_ACCESS_TOKEN`: personal access token used by the Supabase CLI.
- `SUPABASE_DB_PASSWORD`: database password used to push migrations.
- `ADMIN_BOOTSTRAP_EMAIL`: first administrator to invite/grant.
- `GOOGLE_DRIVE_ACCESS_TOKEN`: short-lived OAuth token with Drive read access, **or** `GOOGLE_SERVICE_ACCOUNT_JSON`: the service-account JSON serialized as one environment value. Share source files with that account first.
- `GOOGLE_SHEET_ID`: optional traceability metadata for the migration batch.

Do not configure setup-only secrets in the browser. Remove temporary Google access tokens after migration.

## Operational settings

- `MAX_UPLOAD_FILES` (maximum 10)
- `MAX_UPLOAD_SIZE_MB`
- `REVIEW_TOKEN_HOURS`
- `EMAIL_MAX_ATTEMPTS`
- `RATE_LIMIT_WINDOW_MINUTES`
- `RATE_LIMIT_MAX_SUBMISSIONS`

The database also stores editable departments, RFP types, and workflow targets in `system_settings`; Administrators manage them on the Settings page.

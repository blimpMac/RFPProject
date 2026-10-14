# Netlify deployment

## Prerequisites

- Existing GitHub repository `blimpMac/RFPProject` with this branch pushed normally (never force-push).
- Configured Supabase project with migrations applied.
- Verified SMTP account (Gmail requires MFA and an app password where supported).
- Completed migration verification.

## Netlify configuration

1. In Netlify choose **Add new project → Import an existing project → GitHub**.
2. Select `blimpMac/RFPProject`, branch `main`.
3. `netlify.toml` supplies:
   - Build: `npm run build`
   - Publish: `dist`
   - Functions: `netlify/functions`
   - Node: latest `24.x` (the current Netlify build/functions runtime family)
   - SPA fallback and `/api/*` function routing
   - CSP, HSTS, frame, MIME, referrer, and permissions headers
   - scheduled email queue and abandoned-upload cleanup
4. Add every runtime value from `.env.draft` in Netlify. Mark server values as secrets. Do not set setup-only database/Google credentials unless a deliberate one-time deploy task needs them.
5. Keep Netlify secret scanning enabled.
6. Deploy from `main`.

## Post-deploy checks

- `/` submits a small test request and returns an RFP number.
- `/track/:token` shows only the bearer-authorized request history.
- The attachment exists in the private bucket and cannot be opened without a signed link.
- The request immediately appears in `/admin/monitoring`.
- Supervisor email status becomes `sent`, not merely `queued`.
- `/review/:token` displays details; opening it does not decide anything.
- A decision can be submitted once and produces one Approval Log row and one requestor notification.
- Finance actions, planned check dates, and audit rows persist.
- `/admin`, `/admin/monitoring`, `/admin/approvals`, `/admin/documents`, and `/admin/settings` survive direct browser refresh.

## Rollback

Netlify can republish a prior deploy without rewriting database history. Database migrations are forward-only; create a reviewed corrective migration instead of editing a migration already applied to production.

# IT Administrator Setup and Operations — RFP Monitoring System

## What changed

The IT workspace at `/admin/it` is for IT operations, not Finance approval.
It provides user overview, service monitoring, login presence records, audit trail, direct
password resets without email OTP, and SMTP sender configuration through Vercel's API.

All authorized staff use one login page: `/admin/login`. After authentication,
the server identifies the account's assigned role. The application routes IT
administrators to `/admin/it` and Finance/Department staff to their authorized
dashboard. There is **no separate IT login page**.

IT accounts are granted through a separate `public.it_administrators` table,
**not** through Finance Head `user_roles`. When the IT flag is active, its
login receives only the IT role.

The Audit Trail is now restricted to IT and visible in the IT sidebar. The Finance Head
Account Management screen no longer exposes a reset-password button or email queue diagnostics.

## 1. Apply the database migration to the REAL RFP Supabase project

Before any IT login will work, apply:

`supabase/migrations/20261113092000_it_operations.sql`

Use the production Supabase project defined by `SUPABASE_URL` for the RFP
deployment. Do not substitute an unrelated connected Supabase project.

With the RFP project environment securely configured locally, follow the existing
`docs/ENVIRONMENT.md` and `docs/DEPLOYMENT.md` procedures, including
`npm run db:setup`. Verify the new tables:

- `public.it_administrators`
- `public.staff_presence`
- `public.it_security_events`

They have RLS enabled and no client-side policies. The server's protected Supabase
key performs all IT operations. Never put that key in `VITE_` variables.

## 2. Provision the dedicated IT login

Use a dedicated identity separate from the Finance Head. Set the following in
a local ignored `.env` or approved secret manager; do **not** commit values:

```env
IT_ADMIN_EMAIL=<approved IT administrator email>
IT_ADMIN_FULL_NAME=<approved display name>
IT_ADMIN_INITIAL_PASSWORD=<unique, randomly generated strong temporary password>
```

Choose a password of **at least 14 characters** with uppercase, lowercase,
a number and a symbol. Do not reuse a password already shared in email or chat.

Run:

```sh
npm run admin:bootstrap-it
```

The script creates a confirmed Supabase Auth user, an active staff profile, and
the IT-only role. If the email belongs to an existing user, the script refuses to
change the password or privileges by default. It also rejects an account with
Finance roles. An approved existing non-Finance account requires the explicit
`IT_ADMIN_ALLOW_EXISTING=1` operator override.

Sign in through `/admin/login` and confirm the redirect to `/admin/it`.
The operator should change the temporary password promptly.

## 3. One-time Vercel API authorization (required for website-based SMTP changes)

The RFP website needs a Vercel **server-side project-scoped API token** with
permission to read/update this project's environment variables and create
production redeployments. Create and store this token through the organization's
approved IT process.

Configure these server-only environment variables **once** in the real
`greenlight-rfp` Vercel project, not in the booking website:

```text
VERCEL_API_TOKEN         = <server-only Vercel API token>
VERCEL_RFP_TEAM_ID       = <team ID owning greenlight-rfp>
VERCEL_RFP_PROJECT_ID    = <ID of the greenlight-rfp project>
VERCEL_RFP_PROJECT_NAME  = greenlight-rfp (optional)
```

Mark the token sensitive. Do not place it in source code, a form accessible to
other staff roles, browser variables, logging systems or GitHub commits.

Redeploy the RFP app once to make the new variables available to server
functions. Thereafter, IT can open **IT Dashboard → SMTP sender**, configure only
these three fields, then confirm its own IT login password and click **Save SMTP
and request redeploy**:

- **Email** — the SMTP account username (`SMTP_USER`)
- **SMTP Password** — the authorized app password (`SMTP_PASSWORD`)
- **SMTP From Email** — the visible sender address (`SMTP_FROM_EMAIL`)

The server updates only these three Vercel environment variables.
`SMTP_HOST`, `SMTP_PORT`, and `SMTP_SECURE` remain managed in the
server environment and are never editable from the website. The IT login
password confirmation is for security, not an SMTP setting.

The Vercel API request triggers a _new_ production deployment; the settings
do not take effect until that deployment is READY. Test a sample notification,
review queue diagnostics and verify that the recipient sees the new From
address. Failed builds do not mean sender configuration is live.

If the RFP team does not grant Vercel API access, the SMTP editor displays
**Setup required**. It will not guess a project or silently change a different
site.

## 4. Login monitoring

All signed-in staff browsers send a heartbeat once a minute.
A session displays **Active** when its last heartbeat is within the last three
minutes and no explicit sign-out was recorded. Closing a browser without using
Sign out changes it to Offline after the heartbeat window.

Only successful authenticated sessions after rollout are recorded. Anonymous
public requestors and historical login attempts cannot be identified by this
feature. Session identifiers are keyed hashes; raw access tokens are not stored.

## 5. Password resets without email OTP

Only an authenticated IT administrator can open the Password reset tab.
The IT operator must select the account, enter a strong temporary password,
re-enter it, and confirm the operator's own current password.
A confirmation dialog precedes the API call.

The server validates authorization again, rate-limits requests (maximum five
per IT operator per hour), updates the account using the Supabase admin API,
and logs an event in `it_security_events` without the password.

The action does not require email OTP and does not automatically guarantee
that all already-issued access tokens are invalidated. For a security incident,
coordinate session revocation separately. Protected and other IT accounts
cannot be reset through this interface.

Provide the temporary password via the organization's approved secure channel
and require the user to change it promptly.

## 6. Post-release acceptance checks

1. Normal Finance Member and Finance Head accounts still sign in and can use
   their authorized payment workflow.
2. IT account signs in and shows only IT Dashboard, Audit trail and User Manual.
3. IT cannot access Finance Approval Queue or authorize payments via API.
4. Login sessions appear after a heartbeat; Sign out immediately marks them
   offline; stale sessions expire from Active.
5. Only IT can read Audit Trail and Email Queue Diagnostics.
6. Finance Head no longer has the Reset password button; the old email-reset
   endpoint is blocked.
7. IT can successfully reset a _non-protected approved test account_ without OTP.
8. IT cannot reset itself, another IT administrator, or protected accounts.
9. SMTP edit fails safely when Vercel authorization is missing.
10. After authorization, an approved test SMTP change updates only the RFP
    project, initiates a deployment, and a test message shows the new sender.

## Rollback and incident controls

If the new login, permission checks, or SMTP change fails, stop initiating
further changes. Use the standard reviewed Vercel rollback for application
code and a reviewed corrective database migration if required. Do not delete
existing audit history or manually overwrite production Finance data.

Review `docs/DEPLOYMENT.md` and `docs/ENVIRONMENT.md` for existing
database, Vercel and SMTP operational requirements.

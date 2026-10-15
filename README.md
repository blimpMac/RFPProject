# RFP Monitoring System

A complete React, Vercel, and Supabase replacement for the former Google Sheets / Apps Script workflow. Google Sheets is used only as a one-time migration source. Runtime requests, approvals, documents, roles, audit history, email delivery, and reporting live in Supabase.

## What is implemented

- Public responsive RFP form with server validation, idempotency, rate limiting, active-approver lookup, private direct uploads, progress, and generated RFP number.
- Up to 10 JPG, PNG, WEBP, GIF, or PDF attachments with backend-issued signed upload credentials and private signed downloads.
- Atomic PostgreSQL numbering that continues after the highest migrated `RFP-####` value.
- One-time supervisor links that open a review page but never decide by `GET`; approval/rejection is an atomic, single-use `POST` action.
- Separate department and finance workflows, including documentation requests, planned check dates, change reasons, signatory, and release stages.
- SMTP email queue with deduplication, claim locking, exponential retry, delivery IDs, and failure logging.
- Supabase Auth roles: Administrator, Department Approver, and Finance Reviewer.
- RLS on every application table, private Storage, audit triggers, and immutable approval/source snapshots.
- Dashboard, five-tab Monitoring Sheets workspace, Approvals, Document Management, and Settings.
- CSV/XLSX exports, sorting, search, pagination, sticky identifiers and headers, column visibility, details, and mobile horizontal scrolling.
- Idempotent five-worksheet XLSX migration with complete source snapshots, deterministic relationship matching, row maps, counts, and verification.

## Architecture

```text
Browser (React/Vite/TypeScript)
  ├─ Supabase Auth session
  ├─ private signed Storage upload
  └─ /api/*
       └─ Vercel Functions (service-role operations and authorization)
            ├─ Supabase PostgreSQL + RLS + transactions
            ├─ Supabase private Storage
            └─ SMTP queue worker (Nodemailer)
```

The Supabase secret key and SMTP credentials are used only by Vercel Functions and scripts. They must never use a `VITE_` prefix. Legacy anon/service-role aliases remain optional for older Supabase projects.

## Repository layout

```text
src/                    React application, pages, layout, tables, auth, UI
api/                    Vercel API adapter and protected scheduled jobs
server/                 API, config, validation, auth, email, and Supabase helpers
supabase/migrations/    schema, RLS, Storage policies, atomic workflow functions
supabase/tests/         pgTAP database contract tests
scripts/migration/      complete workbook and historical attachment importers
scripts/setup/          database and first-admin automation
scripts/verification/   database and source/target reconciliation
docs/                   environment, migration, and deployment runbooks
tests/                  Vitest unit and contract tests
```

## Local development

Requirements: Node.js 24+, npm, and a Supabase project.

1. `npm install`
2. Configure the ignored `.env` described in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md). Never commit `.env`.
3. `npm run db:setup`
4. `npm run admin:bootstrap`
5. `npm run dev`

The public form is `/`; staff sign-in is `/admin/login`.

## Setup order

1. Complete [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).
2. Apply the database with `npm run db:setup`.
3. Export the source Google workbook once as `.xlsx` and run the steps in [docs/MIGRATION.md](docs/MIGRATION.md).
4. Bootstrap the first administrator.
5. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run db:test`.
6. Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

No individual SQL statements or tables need to be copied by hand. The migrations create the schema, database functions, RLS policies, private bucket, and defaults together.

## Security notes

- Public submission is mediated by the Vercel API; anonymous clients cannot call privileged database functions.
- Client IPs are HMAC-hashed for rate limiting and are never stored in plaintext.
- File type and size are checked before issuing signed uploads. Storage is private.
- Review credentials are random 256-bit tokens; only hashes are stored in `approval_tokens`.
- Review tokens are single-use and expire. Decisions lock both token and request rows.
- Ordinary users cannot grant roles. Only the service API after an Administrator check writes `user_roles`.
- Approval logs and migration source snapshots reject updates/deletes at the database layer.
- A queue record being `queued` or `retry` is not presented as delivery; only SMTP success sets `sent`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite frontend development server |
| `npm run dev:vercel` | Local Vercel frontend/functions runtime |
| `npm run build` | TypeScript check plus production Vite build |
| `npm run lint` | ESLint |
| `npm test` | Unit and static security-contract tests |
| `npm run db:setup` | Link the configured Supabase project and push every migration |
| `npm run admin:bootstrap` | Invite/grant the first administrator |
| `npm run migrate:workbook -- source.xlsx` | Back up and import the complete five-tab workbook |
| `npm run migrate:attachments` | Transfer accessible historical Drive files into private Storage |
| `npm run migrate:verify -- source.xlsx` | Reconcile source and target counts/IDs |
| `npm run db:test` | Verify target tables, bucket privacy, and next sequence |

## Deployment status

Production is deployed at `https://greenlight-rfp.vercel.app` with Supabase Auth, database, private Storage, API functions, account roles, reset-password redirects, and daily maintenance jobs configured. SMTP delivery remains disabled until a verified SMTP account and app password are supplied; queued workflow notifications cannot be delivered without those credentials.

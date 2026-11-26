# RFP Monitoring System

A production-oriented Request for Payment (RFP) monitoring and approval application built with React, TypeScript, Vercel, and Supabase. It replaces the former Google Sheets / Apps Script workflow. Google Sheets is retained only as a historical migration source; live requests, approvals, attachments, roles, audit history, notifications, and monitoring are handled by the application and its Supabase backend.

**Production website:** https://greenlight-rfp.vercel.app  
**Production branch:** `main`  
**Runtime:** Vercel Functions · Supabase · Node.js 24

---

## Overview

The system supports the full RFP lifecycle, from public request submission through Department Head review and Finance processing, check release, and monitoring.

### Public request submission

- Responsive public RFP form with server-side validation.
- Request-type-specific fields and required supporting-document guidance.
- Generated RFP reference number and submission tracking.
- Private attachment uploads using signed Storage credentials.
- Upload limits and accepted formats are enforced by the server.
- SOF references accept a variable number of digits; the format is not restricted to a fixed five-digit length.

### Department review

- Department Head review through the staff application and secure review links.
- Approve, reject, or return requests for correction, according to the configured workflow.
- One-time review links do not make decisions when opened; a decision requires an explicit action.
- Review credentials are single-use and expire.

### Finance processing

- Finance queue and role-based access for Finance Members and the Finance Head.
- Finance processing combines the applicable approval, original-document receipt/verification, and processing information into one action.
- Subsequent check stages are tracked separately:
  1. Check Approval
  2. Check Releasing
  3. Check Released
- Completed requests remain available in monitoring rather than disappearing from the record.
- Workflow history and audit information support traceability.

### Monitoring and reporting

- Dashboard and Monitoring Sheets workspace.
- Request status, workflow history, document registry, and audit information.
- Search, sorting, pagination, column visibility, request details, and export features.
- CSV/XLSX exports where supported by the relevant monitoring view.
- Finance processing SLA is measured in Philippine working days. Saturdays, Sundays, and configured Philippine holidays are excluded; see the SLA implementation and tests before changing the calendar rules.

### Accounts and IT operations

- One staff login page: `/admin/login`. The application routes authenticated users according to their assigned access.
- Application roles include Department Approver and Finance Reviewer; the protected Finance Head identity is documented in the architecture guide.
- Dedicated IT workspace at `/admin/it` for authorized IT administrators.
- IT operations include user overview, service monitoring, login presence, audit trail, direct password resets without email OTP, and SMTP sender configuration.
- IT access is separate from Finance workflow roles.

### Notifications

- Workflow notifications are placed in a durable email queue with deduplication, locking, retries, delivery identifiers, and failure logging.
- SMTP delivery is handled server-side; SMTP credentials must never be exposed through browser variables or committed to Git.
- A queued notification is not proof of delivery. A message is considered sent only after SMTP reports success.
- The production project has SMTP sender credentials configured through its deployment environment. Actual recipient delivery should still be verified through a test notification and the email queue diagnostics.

---

## Technology and architecture

- **Frontend:** React, TypeScript, Vite
- **Backend:** Vercel Functions and server-side services
- **Database and authentication:** Supabase PostgreSQL and Supabase Auth
- **File storage:** Supabase private Storage
- **Email:** Nodemailer and SMTP queue processing
- **Testing:** Node.js test runner, TypeScript, ESLint, Prettier, and pgTAP/database verification

```text
Browser (React / TypeScript)
  ├── Supabase Auth session
  ├── signed private-file upload/download
  └── /api/*
       └── Vercel Functions
            ├── authentication and authorization
            ├── request and approval services
            ├── Supabase PostgreSQL (RLS and transactions)
            ├── Supabase private Storage
            └── SMTP notification queue
```

Secrets and privileged database operations remain server-side. The Supabase secret key, Vercel API token, approval-token encryption key, cron secret, and SMTP password must not be exposed to the browser or committed to the repository.

## Repository structure

| Path | Responsibility |
|---|---|
| `src/pages/` | Page composition and navigation |
| `src/features/` | Feature-specific UI, hooks, and presentation logic |
| `src/components/` | Shared application components |
| `src/lib/` | Frontend utilities |
| `api/` | Vercel API adapter and protected scheduled jobs |
| `server/routes/` | HTTP parsing, authentication, and route delegation |
| `server/services/` | Workflow and business logic |
| `server/lib/` | Validation, authorization, configuration, and helpers |
| `server/email/` | Email queue and notification templates |
| `shared/contracts/` | Shared frontend/backend contracts |
| `supabase/migrations/` | Database schema, RLS, Storage policies, and functions |
| `supabase/tests/` | Database contract tests |
| `scripts/` | Setup, migration, and verification scripts |
| `docs/` | Setup and operational documentation |

For detailed boundaries and conventions, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/CODE_STRUCTURE.md](docs/CODE_STRUCTURE.md).

---

## Local development

### Requirements

- Node.js 24.x
- npm
- Access to the RFP Supabase project for database-backed development
- Git

### Start the application

1. Clone the repository and enter the project directory.
2. Install dependencies:
   ```sh
   npm install
   ```
3. Create a local ignored `.env` file using [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) as the variable reference. Do not commit secrets.
4. Apply or verify the required database migrations using the approved project credentials:
   ```sh
   npm run db:setup
   ```
5. Start the frontend:
   ```sh
   npm run dev
   ```

The public request form is available at `/`; staff sign-in is at `/admin/login`.

For local Vercel Functions development, use:

```sh
npm run dev:vercel
```

Do not run bootstrap, migration, or database setup commands against production unless the change is approved and the target project has been checked.

---

## Setup and deployment guides

Follow the guides in this order when setting up a new environment:

1. [Environment variables and secrets](docs/ENVIRONMENT.md)
2. [Database setup and migration](docs/MIGRATION.md)
3. [Vercel deployment and post-deploy checks](docs/DEPLOYMENT.md)
4. [IT administrator setup and operations](docs/IT_OPERATIONS.md)
5. [Architecture and code structure](docs/ARCHITECTURE.md) · [Code structure](docs/CODE_STRUCTURE.md)

The setup scripts and migrations create the required database objects, functions, policies, and private Storage configuration. Do not manually copy individual SQL statements into an unrelated Supabase project.

## Important security and operational rules

- Use only the designated RFP Supabase project for this application. Do not substitute another project's credentials.
- Keep `.env` out of Git. Never use a `VITE_` prefix for server secrets.
- Do not expose service/secret keys, SMTP passwords, Vercel API tokens, or review-token encryption keys in client code, logs, screenshots, or commits.
- Public submissions and privileged workflow actions must pass through server-side authorization and validation.
- Keep Storage private; use server-issued signed upload/download credentials.
- Do not treat a queued or retrying email as delivered.
- Do not delete or manually overwrite production requests, approval history, or audit records during testing.
- Database migrations already applied to production are forward-only. Use a reviewed corrective migration rather than editing an applied migration.
- Push application changes directly to `main` using normal, non-force updates. Vercel production deployment follows the configured `main` branch.

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite development server |
| `npm run dev:vercel` | Run the local Vercel development environment |
| `npm run build` | TypeScript check and production frontend build |
| `npm run typecheck` | Run TypeScript project checks |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit and domain-contract tests |
| `npm run check` | Run formatting, type, lint, test, and build checks |
| `npm run db:setup` | Link configured Supabase project and apply migrations |
| `npm run db:test` | Verify database objects and storage configuration |
| `npm run admin:bootstrap` | Bootstrap the first administrator in a new environment |
| `npm run admin:bootstrap-it` | Provision an approved IT administrator |
| `npm run migrate:workbook -- source.xlsx` | Import the historical workbook |
| `npm run migrate:attachments` | Migrate accessible historical attachments |
| `npm run migrate:verify -- source.xlsx` | Reconcile source and target migration data |
| `npm run test:email-delivery` | Run the configured email-delivery verification script |

Review each script and confirm its target environment before running it against production.

## Production status

The production application is hosted at **https://greenlight-rfp.vercel.app** and is connected to the RFP Supabase project. The production Vercel project is configured to deploy from `main`.

The latest production deployment verified during this README update is:

- **Branch:** `main`
- **Commit:** `bdec81618947c315a51f0937e3b5536570cb6365`
- **Deployment state:** READY
- **Deployment URL:** https://greenlight-8qs99831q-gree7.vercel.app

A READY deployment confirms that Vercel completed the deployment; it does not by itself prove that every live request, attachment, approval, and email workflow has passed end-to-end testing. Record UAT results separately and report any blocked test rather than marking it as passed.

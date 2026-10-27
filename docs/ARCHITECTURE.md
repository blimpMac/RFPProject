# Application architecture

The RFP system uses a feature-oriented structure. New work should keep route files thin and move business rules into focused modules.

## Frontend

- `src/pages/` composes screens and owns page-level loading/navigation only.
- `src/features/<feature>/` contains feature components, hooks, calculations, and presentation helpers.
- `src/components/` contains shared UI used across features.
- `src/lib/` contains framework-agnostic client utilities.
- `shared/contracts/` contains server/client contracts.

Large page files should be split when a section has its own state, validation, or reusable behavior. Account-management forms now live under `src/features/accounts/` and SLA rules live under `src/features/requests/`.

## Backend

- `server/routes/` performs HTTP parsing, authentication, and delegation.
- Nested route modules such as `server/routes/administration/` and `server/routes/staff/` own one API area.
- `server/services/` owns workflow/business rules and reusable database operations.
- `server/lib/` owns validation, authentication, configuration, and low-level helpers.

A route should not duplicate approval or permission rules already available from a service. New workflow behavior belongs in a service first, then the route calls it.

## Workflow safety

- Only `super_administrator` is Finance Head.
- Finance actions are limited to Finance Members and Super Admin according to stage.
- Department Head changes must refresh/revoke pending review credentials.
- Stored workflow states remain authoritative. Derived presentation such as SLA/overdue labels must not overwrite workflow state.
- Protected operational accounts and the active Super Admin cannot be removed from Account Management.

## Refactoring rule

Prefer small, behavior-preserving extractions before feature changes. Run `npm run check` after every structural change. Avoid mixing a large workflow rewrite with a visual redesign in the same commit.

## Current feature boundaries

- `src/features/approvals/` owns Finance queue filtering, table presentation, SLA presentation, Finance receipt editing, and workflow-action UI.
- `server/routes/staff/finance.ts` owns Finance action/update HTTP endpoints and uses the central `financeRoles` policy.
- `server/routes/staff/monitoring.ts` owns monitoring, audit-trail, and document-registry reads.
- `server/routes/staff/department.ts` owns Department Head decisions.
- `server/routes/staff/attachments.ts` owns Digital RFP retrieval and attachment signing/preview endpoints.
- `server/routes/staff.ts` is intentionally only a dispatcher plus the signed-in staff identity endpoint.

Architecture regression tests enforce these boundaries and keep the largest dispatcher/page files below agreed size limits.

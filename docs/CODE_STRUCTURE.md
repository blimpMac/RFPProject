# Code structure

This project separates browser UI, server orchestration, domain rules, external services, database migrations, and operational scripts. Keep new code in the narrowest layer that owns the behavior.

## Directory responsibilities

| Directory              | Responsibility                                                           |
| ---------------------- | ------------------------------------------------------------------------ |
| `src/components`       | Reusable UI with no route ownership                                      |
| `src/features`         | Feature-level hooks and components shared by related routes              |
| `src/pages`            | Route-level screens and page-specific state                              |
| `src/layouts`          | Shared page shells and navigation                                        |
| `src/hooks`            | Reusable browser state and lifecycle behavior                            |
| `src/lib`              | Browser API clients, formatting, validation, and infrastructure helpers  |
| `server/domain`        | Shared business roles, constants, and pure domain rules                  |
| `server/services`      | Reusable server operations that coordinate database or email work        |
| `server/routes`        | Small route groups for public, staff, and administrative APIs            |
| `server/email`         | Email delivery and templates                                             |
| `server/lib`           | Authentication, configuration, HTTP, security, and server infrastructure |
| `api`                  | Vercel entry points and scheduled jobs                                   |
| `scripts/setup`        | Explicit administrative or environment setup commands                    |
| `scripts/verification` | Read-only or clearly labelled workflow verification commands             |
| `supabase/migrations`  | Ordered database schema and function changes                             |
| `shared/contracts`     | Framework-neutral request and response types used across runtime layers  |

## Dependency direction

Use this direction when adding features:

1. Pages compose components and hooks.
2. Components and hooks call browser helpers in `src/lib`.
3. API routes authenticate and validate input, then delegate reusable work to `server/services`.
4. Services use domain rules and server infrastructure.
5. Database-specific behavior remains in migrations or narrowly scoped services.

The main API entry point only selects a route group and translates errors. Route modules own HTTP
concerns; reusable database and workflow operations belong in services.

Avoid importing page modules into components, browser modules into server code, or Vercel handlers into domain and service modules.

## Formatting and validation

Run these commands before committing:

```bash
npm run format
npm run check
```

`npm run format` applies the repository formatting rules. `npm run check` verifies formatting, TypeScript, ESLint, and the production build.
It also runs deterministic domain tests located next to the code they verify as `*.test.ts`.

Editors that support EditorConfig should automatically use UTF-8, LF line endings, two-space indentation, final newlines, and trimmed trailing whitespace.

## API changes

Keep route handlers focused on four steps:

1. Validate the HTTP method and authenticate the caller.
2. Parse input with a schema.
3. Delegate reusable business operations to a service.
4. Return a small typed response.

Extract a service when logic is shared, performs multiple database operations, or represents a named business operation. Keep authorization close to the route and enforce critical invariants again in the database.

## UI changes

Page modules own data loading and route-specific state. Extract a component when a section has its own interaction state, is reused, or makes the page difficult to scan. Keep shared controls in `src/components/ui.tsx` and use existing design-system classes before introducing new CSS.

All responsive controls must be checked at a 360-pixel viewport and at desktop width. Tables should scroll inside their container and must not widen the document body.

## Operational scripts

Destructive scripts must default to dry-run behavior, identify counts before execution, require an explicit execution flag, protect required accounts, and verify the final state. Never place credentials in source files or console output; load them from the local environment.

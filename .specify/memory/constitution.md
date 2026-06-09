```md
<!--
  Sync Impact Report

  Version change: 1.4.1 → 2.0.0 (MAJOR)
  Changes:
    - Removed: Principle II (Three-Layer Separation)
    - Removed: Principle III (Inward Dependency Flow)
    - Removed: Principle IV (Aggregate-Owned Repositories)
    - Removed: Principle V → renumbered to III (Test-First → Test as You Go)
    - Removed: Shared Infrastructure section
    - Removed: 140 lines of ceremonial rules
    - Added: Principle II (Nuxt 4 Native — framework-first approach)
    - Rewritten: Principle I (simplified, no layer references)
    - Simplified: Development Workflow & Code Standards
    - Simplified: Technology Stack
  Templates requiring updates:
    - .specify/templates/plan-template.md: no changes needed
    - .specify/templates/spec-template.md: no changes needed
    - .specify/templates/tasks-template.md: no changes needed
    - .specify/templates/checklist-template.md: no changes needed
  Follow-up TODOs:
    - Update specs/001-auth-context/plan.md (remove architecture/code)
    - Update specs/001-auth-context/spec.md (remove architecture/code)
-->

# Merp Constitution

This project follows a **Context-First, Framework-Native** approach.
Bounded contexts organize business domains; Nuxt 4 provides the structure.
Write code in the framework first. Extract layers only when a file grows
beyond clarity — never before.

## Core Principles

### I. Bounded Contexts

The system is organized by independent bounded contexts.
`fiscal` is the **core domain** — it MUST be developed first with
highest rigor. Supporting domains are `auth` and `financeiro`.

**MVP Phase**: Contexts may be simplified and merged for speed. For example,
`emitente` and `destinatario` may begin as value objects inside `nota/`,
then graduate later. `cfop`, `regime-tributario`, and `imposto` start as
enums or simple types. Isolation is the long-term target, not a mandatory
starting point.

Communication between contexts happens through IDs, DTOs, and public
functions. Direct type imports across contexts are discouraged.

The `shared/` directory is infrastructure-only — it MUST NOT contain
business types or logic.

*Rationale: Bounded context isolation prevents coupling between separate
business areas. Fiscal is the primary value driver.*

### II. Nuxt 4 Native

Write route handlers directly in `server/api/` using Nitro's
`defineEventHandler`. Use Drizzle directly in handlers — no repository
layer, no service layer, no interfaces.

Rules:
- Each route file is self-contained. Validate input, query Drizzle,
  return response.
- If a handler exceeds ~100 lines, extract helpers to `server/utils/`
  (auto-imported by Nitro — no manual imports needed).
- Keep all Drizzle table definitions in `server/utils/schema.ts`
  (auto-imported).
- Extract business logic only when the same code repeats across routes.
- No premature abstraction. No interfaces. No repository pattern.
  You'll feel it when extraction is needed — trust that.

Nitro middleware in `server/middleware/` handles cross-cutting concerns
(auth, tenant context).

*Rationale: Nuxt 4 and Nitro already provide structure. Adding layers
before they're needed increases friction for junior developers and slows
MVP delivery. Extract when it hurts, not before.*

### III. Test as You Go

Write tests alongside implementation. Vitest is the testing framework.

**Unit tests**: Mock Drizzle queries. Do not access a real database.
**Integration tests**: Cover real queries, constraints, and RLS.
Run separately from unit tests.

Priority: fiscal critical paths (emission, tax calculation, status
transitions, validation rules).

Every route handler and extracted function SHOULD have a corresponding
`.spec.ts`. Tests describe behavior — WHAT is tested, not HOW.

**MVP Shortcut**: Tests may follow in the next commit if shipping speed
is critical.

*Rationale: Tests validate behavior without coupling to implementation.
The fiscal domain carries regulatory risk — coverage is non-negotiable
there.*

### IV. Error Handling

Use `createError` from Nitro for all HTTP error responses. Be consistent
within each bounded context.

Unhandled errors MUST NOT leak internal details to clients. Use a
centralized error handler at the Nitro layer for unexpected failures.

*Rationale: Fiscal systems require predictable failure modes. Nitro's
error handling is simple and sufficient for MVP.*

### V. Tenant Isolation

All business entities MUST belong to a tenant (via `company_id`).
Cross-tenant access is forbidden — enforce at both the database (RLS)
and application levels.

*Rationale: ERP systems manage data for multiple companies. Tenant
boundaries are business boundaries.*

### VI. Transactions & Idempotency

Operations spanning multiple tables SHOULD execute inside explicit
database transactions.

Commands with external side effects (NF-e emission, email, webhooks,
boleto generation) SHOULD be idempotent whenever practical.

Domain events and outbox patterns are deferred until operational
complexity requires them.

*Rationale: Fiscal workflows involve external systems and multi-step
writes. Transactions and idempotency reduce inconsistency without
introducing unnecessary complexity during MVP.*

## Technology Stack

| Concern            | Choice                                   |
| ------------------ | ---------------------------------------- |
| Frontend / Backend | Nuxt 4 (monorepo)                        |
| API Layer          | Nitro server routes                      |
| Database           | Supabase PostgreSQL via DATABASE_URL     |
| ORM                | Drizzle ORM with postgres-js             |
| Auth               | Better Auth with Drizzle adapter         |
| Testing            | Vitest                                   |
| Language           | TypeScript                               |
| Mobile             | Out of scope                             |

## Project Layout

```
server/
├── api/              # Nitro routes — one file per endpoint
├── middleware/        # Server middleware (auth, tenant)
└── utils/            # Auto-imported helpers (db, schema, helpers)
shared/               # Infra config (auth instance, logger)
app/                  # Nuxt frontend (Vue pages, components)
specs/                # Feature documentation (Spec Kit)
```

## Code Standards

- Prefer simple async functions. Classes are optional.
- No `any` — use `unknown` with type guards.
- No `console.log` — use the shared logger (`shared/logger.ts`).
- Split files when they grow beyond clarity (~150 lines as heuristic).
- Conventional Commits: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Every `feat` commit SHOULD include tests (or in the next commit).

**Forbidden**:
- Business logic in route validation/parsing.
- Provider libraries outside `shared/` and `server/utils/`.
- Shared business types in `shared/`.

## Database Migrations

Drizzle Kit manages all schema changes. Migration files are the source
of truth and are treated with the same discipline as application code.

| Command                | Purpose                       |
| ---------------------- | ----------------------------- |
| `drizzle-kit generate` | Generate migration from schema |
| `drizzle-kit migrate`  | Apply migrations to database   |
| `drizzle-kit studio`   | Inspect schema during dev      |

**Rules**:
- Migration files MUST be committed with the schema change that produced
  them — never in a separate commit.
- Never edit generated migration files manually. Adjust the schema and
  regenerate instead.
- For fiscal-domain schema changes, include a brief SQL comment explaining
  the business reason.
- Destructive migrations (column drops, table renames, type changes)
  require a documented rollback plan in the PR body before merge.

## Governance

This constitution supersedes all other practices defined in the project.
Any deviation requires documented justification in the PR.

**Amendment Process**: Document changes in the PR that introduces them.
The rationale must be in the PR description. Standard code review approval
is sufficient. Once merged, bump version and update the Sync Impact Report.

Version bumps follow semantic versioning:
- MAJOR — backward-incompatible governance changes or principle removals.
- MINOR — new principles or materially expanded guidance.
- PATCH — clarifications, wording refinements, typo fixes.

Compliance is verified during code review and spec/plan generation.

**Version**: 2.0.0 | **Ratified**: 2026-06-08 | **Last Amended**: 2026-06-10
```

<!--
  Sync Impact Report

  Version change: 2.3.0 → 2.4.0 (MINOR)
  Changes:
    - Added: Database & Multi-tenancy section with withTenant helper mandate,
      RLS policy rules, and PR gate for violations
    - Updated: III. Test as You Go — mandated co-located tests, removed MVP
      shortcut, changed SHOULD to MUST. Updated Code Standards accordingly.
  Templates requiring updates:
    - .specify/templates/plan-template.md: ✅ updated (no changes needed - generic)
    - .specify/templates/spec-template.md: ✅ updated (no changes needed - generic)
    - .specify/templates/tasks-template.md: ✅ updated (no changes needed - generic)
    - .specify/templates/checklist-template.md: ✅ updated (no changes needed - generic)
  Follow-up TODOs:
    - Update specs/001-auth-context/spec.md (add Infrastructure Dependencies section)
    - Update specs/001-auth-context/tasks.md (mark tenant-data tasks with withTenant TODO)
-->

# Merp Constitution

This project follows a **Context-First, Framework-Native, Dockerized** approach.
Bounded contexts organize business domains; Nuxt 4 provides the structure.
Write thin handlers in the framework. All data access through a repository.
The application runs fully containerized via Docker.

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

### II. Nuxt 4 Native + Repository Layer

Route handlers live in `server/api/` and use Nitro's `defineEventHandler`.
Handlers are thin: validate input, call a repository, return response.
All data access goes through a typed repository interface.

Rules:
- Each route handler delegates data access to a repository — never
  imports or calls Drizzle directly.
- Repositories are defined in `server/utils/{context}/repository.ts`.
  Each file exports an interface (e.g. `IAuthRepository`) and a
  `DrizzleXxxRepository` implementation.
- Interfaces enable Vitest mocks in unit tests and future ORM/DB swapping
  without touching route handlers (Dependency Inversion Principle).
- Keep all Drizzle table definitions in `server/utils/schema.ts`
  (auto-imported by Nitro).
- Extract shared business logic to `server/utils/{context}/helpers.ts`
  only when it repeats across multiple routes.
- No service layer unless a handler grows beyond clarity after extracting
  to helpers. No DI containers. No decorators. No class inheritance.

Nitro middleware in `server/middleware/` handles cross-cutting concerns
(auth, tenant context).

*Rationale: A thin repository layer costs almost nothing during MVP but
unlocks Vitest mocking and the ability to swap Drizzle without touching
handlers. Service layers are deferred — extract only when it hurts.*

### III. Test as You Go

Write tests alongside implementation. Vitest is the testing framework.

**Test co-location**: Tests MUST reside beside the code they validate,
never under `/specs`. The `/specs` directory is documentation-only and
MUST NOT contain any executable code, including tests, mocks, fixtures,
or scripts.

**Unit tests**: Mock the repository interface. Do not access a real database.
**Integration tests**: Cover real queries, constraints, and RLS.
Run separately from unit tests.

Test file naming: `<file-under-test>.test.ts` (e.g. `register.post.ts`
→ `register.post.test.ts`).

Priority: fiscal critical paths (emission, tax calculation, status
transitions, validation rules).

Every route handler and repository MUST have a corresponding `.test.ts`
file. Tests describe behavior — WHAT is tested, not HOW.

**No MVP Shortcut**: Tests are mandatory in every commit. Code without
tests is not complete.

*Rationale: Tests validate behavior without coupling to implementation.
The fiscal domain carries regulatory risk — coverage is non-negotiable
there. Enforcing co-location prevents `/specs` from accumulating
executable files and keeps implementation and validation tightly
coupled.*

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
| Database           | PostgreSQL                               |
| ORM                | Drizzle ORM with postgres-js             |
| Containerization   | Docker (Dockerfile + docker-compose.yml) |
| Auth               | Better Auth with Drizzle adapter         |
| Testing            | Vitest                                   |
| Language           | TypeScript                               |
| Mobile             | Out of scope                             |

## Project Layout

```
Dockerfile           # Multi-stage build for production
docker-compose.yml   # PostgreSQL + app services
server/
├── api/             # Nitro routes — thin handlers (one file per endpoint)
├── middleware/      # Server middleware (auth, tenant)
└── utils/           # Auto-imported helpers
    ├── schema.ts    # All Drizzle table definitions
    ├── db.ts        # Database connection
    └── {context}/   # e.g. auth/, companies/, fiscal/
        ├── repository.ts  # IXxxRepository interface + DrizzleXxxRepository
        └── helpers.ts     # Shared business logic (extracted when needed)
shared/              # Infra config (auth instance, logger)
app/                 # Nuxt frontend (Vue pages, components)
specs/               # Feature documentation (Spec Kit)
```

## Code Standards

- Prefer simple async functions. Classes only for repository implementations.
- No `any` — use `unknown` with type guards.
- No `console.log` — use the shared logger (`shared/logger.ts`).
- Split files when they grow beyond clarity (~150 lines as heuristic).
- Conventional Commits: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Tests are mandatory with every `feat` or `fix` commit. No exceptions.
- Test files MUST be co-located with the code they test.

**Forbidden**:
- Business logic in route validation/parsing.
- Drizzle queries outside repository implementations.
- Provider libraries outside `shared/` and `server/utils/`.
- Shared business types in `shared/`.
- Cross-context repository imports.

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

## Containerization

The application MUST run fully containerized via Docker in both
development and production environments.

- `Dockerfile` at project root — multi-stage build producing an optimized
  production image.
- `docker-compose.yml` at project root — defines the app (Nuxt/Nitro)
  and PostgreSQL services. The PostgreSQL service is the default database
  target for local development.
- All system-level dependencies MUST be declared in the Docker image.
  No host-installed tooling outside the Docker environment is required
  for development or deployment.
- Docker volumes persist PostgreSQL data across restarts (`pgdata`).
- Environment configuration (ports, secrets, database URL) flows through
  `docker-compose.yml` environment variables or an accompanying `.env`
  file — never hardcoded in the image.

**Rules**:
- The `docker-compose.yml` MUST be the single command to start the full
  stack locally (`docker compose up`).
- The `Dockerfile` MUST support both development (with hot-reload via
  Nitro's dev server) and production (optimized, non-dev build).
- Database credentials and secrets MUST NOT be committed — use `.env`
  files (documented in `.env.example`).
- CI pipelines MUST use the same Dockerfile and docker-compose setup
  to ensure environment parity.

*Rationale: Dockerized environments guarantee consistency across
developer machines, CI, and production. Infrastructure as code keeps
the runtime specification versioned alongside the application.*

## Database & Multi-tenancy

All tenant-scoped queries MUST use the `withTenant(tenantId, fn)` helper.
It acquires a dedicated connection from the pool, sets the PostgreSQL
session variable `app.tenant_id` via `set_config`, and provides a
tenant-isolated Drizzle instance to the callback.

Rules:
- Every query against a table with `tenant_id` MUST be wrapped in
  `withTenant(tenantId, fn)` — no exceptions.
- Direct `db` access is permitted only for global data: lookup tables,
  tenant onboarding (company creation), and system-level operations
  that precede tenant context.
- `set_config('app.tenant_id', ...)` MUST NOT be called directly
  outside the `withTenant` helper.
- `withTenant` is the single runtime entry point for tenant context.
- Every new table containing tenant data MUST have RLS enabled and a
  policy that filters by `tenant_id` using
  `current_setting('app.tenant_id')::UUID`.
- Violations of these rules block PR approval — no exceptions.

*Rationale: RLS guarantees that even a misrouted query cannot leak data
across tenants. The `withTenant` helper enforces this at the application
layer, creating a defense-in-depth boundary. A single helper keeps the
contract explicit and testable.*

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

**Version**: 2.4.0 | **Ratified**: 2026-06-08 | **Last Amended**: 2026-06-15

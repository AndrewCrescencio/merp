```md
<!--
  Sync Impact Report

  Version change: 1.4.0 → 1.4.1 (PATCH)
  Modified sections:
    - Principle III → generalized provider-library restriction
    - Development Workflow & Code Standards → class-based services are preferred, not mandatory
    - Development Workflow & Code Standards → removed hard file-size limit
    - Forbidden → bounded-context imports are discouraged instead of absolutely forbidden
  Added sections:
    - Principle VII → Tenant Isolation
    - Principle VIII → Transactions and Idempotency
  Removed sections: N/A
  Templates requiring updates:
    - .specify/templates/plan-template.md: no changes needed
    - .specify/templates/spec-template.md: no changes needed
    - .specify/templates/tasks-template.md: no changes needed
    - .specify/templates/checklist-template.md: no changes needed
  Follow-up TODOs: None
-->

# Merp Constitution

This project follows a **Domain-First, Feature-Isolated** approach.
All features are implemented inside isolated bounded contexts with strict
separation between domain (business rules), application (I/O), and
infrastructure (persistence). Simple class-based services and repository
interfaces are preferred over functional architecture.

## Core Principles

### I. Domain-First, Feature-Isolated Bounded Contexts

The system is organized by independent bounded contexts.
`fiscal` is the **core domain** — it MUST be developed first and with
highest rigor. Supporting domains are `auth` and `financeiro`.

**MVP Phase**: Contexts may be simplified and merged for speed. For example,
`emitente` and `destinatario` may begin as value objects inside `nota/`,
then graduate to full aggregates. `cfop`, `regime-tributario`, and
`imposto` typically start as enums or value objects. Isolation is the
long-term target, not the mandatory starting point.

Communication between contexts happens exclusively through IDs, DTOs, and
public services.
The `shared/` directory is infrastructure-only — it MUST NOT contain domain
entities, domain types, or business logic.

*Rationale: Bounded context isolation prevents coupling between separate
business areas. Fiscal is the primary value driver and must remain the
most rigorously structured context. The MVP clause prevents over-engineering
the initial domain model. Cross-context contamination remains the primary
source of architectural erosion in ERP systems.*

### II. Three-Layer Separation of Responsibilities

Every file belongs to exactly one of three layers:

- **Application** — input/output (controllers, DTOs)
- **Domain** — business rules (services, repository interfaces, types)
- **Infrastructure** — persistence, external providers (repositories, clients)

No file may mix these responsibilities.
Controllers convert input to DTOs, call services, and return responses.
Controllers contain zero business logic and MUST NOT import provider libraries.
Services contain all domain rules and depend only on repository interfaces.
Repositories implement those interfaces using provider-specific code.

*Rationale: Strict layering ensures business rules remain testable and
replaceable independently of frameworks and databases.*

### III. Inward Dependency Flow

Dependencies flow inward: `application → domain ← infrastructure`.
Domain NEVER depends on application or infrastructure.
Domain types (`types.ts`) contain only interfaces and type aliases — no
classes, no logic.

Provider libraries MUST only appear inside infrastructure implementations —
never in services, domain types, or controllers.

**YAGNI**: Replacing Supabase is an aspirational goal, not an MVP requirement.
Provider-specific code in repositories is acceptable. The swap path exists
conceptually via interfaces; optimize for shipping over perfect interchangeability.

*Rationale: A pure domain layer protects business rules from framework churn
and infrastructure volatility.*

### IV. Aggregate-Owned Repositories

Each aggregate owns its own repository interface and implementation.
Large contexts are split by aggregate (e.g., `nota/`, `emitente/`,
`destinatario/`, `cfop/`, `regime-tributario/`, `imposto/`).
No God repositories or God services with dozens of methods.
Repository interfaces live in the domain layer; implementations are
provider-specific (e.g., `SupabaseNotaRepository` → `PostgresNotaRepository`
swap without changing services).

*Rationale*: Aggregate boundaries mirror transaction consistency boundaries.
Per-aggregate repositories keep each unit focused, testable, and
independently replaceable.

**MVP Phase**: A single repository per context is acceptable initially
(e.g., `NotaRepository` handling `nota`, `emitente`, `destinatario`).
Split when methods exceed clarity or transaction boundaries diverge.

### V. Test-First Discipline

Write tests alongside implementation in the same commit. Do not defer tests
as a separate task. This is the preferred, expected workflow.

Red → Green → Refactor is the recommended cycle, not a strict gate.
Vitest is the testing framework.

Prioritize coverage on fiscal critical paths: emission flows, tax
calculations, status transitions, and validation rules. Avoid locking test
suites to implementation details that shift frequently during early domain
discovery — the fiscal model will evolve as business rules are clarified.

**Unit tests**: Mock Supabase; services depend only on repository interfaces.
Unit tests MUST NOT access a real database.

**Integration tests**: Cover real queries, constraints, and RLS.
These run separately from unit tests (e.g., on CI or a dedicated test suite).

Every service and repository MUST have a corresponding `.spec.ts` committed
in the same logical feature, not necessarily the same commit.
Tests describe behavior — WHAT is tested, not HOW.

**MVP Shortcut**: For small features (screens, simple CRUD), tests may follow
implementation in the next commit if shipping speed is critical.

*Rationale*: Writing tests with implementation ensures interfaces are designed
before implementation details ossify. Fiscal critical paths are the highest
ROI coverage targets — they carry regulatory and financial risk. Mocked
repositories ensure fast, deterministic, isolated unit tests; integration
tests catch provider-specific breakage.

### VI. Error Handling

Use typed exceptions consistently across all layers.
All service failures must map to HTTP status codes explicitly via Nitro's
`createError`. Unhandled errors must not leak internal details to clients.

A `Result<T, E>` pattern is a valid alternative but is not required for MVP —
it adds expressive power at the cost of onboarding friction and verbosity.
The default acceptable approach is a typed `throw` with a centralized error
handler at the Nitro layer.

Whichever pattern is chosen, it MUST be applied consistently within a context.
Do not mix `Result` and `throw` styles inside the same bounded context.

*Rationale*: Fiscal systems require predictable failure modes. Inconsistent
error handling is a regulatory and UX risk. The Nitro-first approach is
simpler to audit and sufficient for the MVP phase.*

### VII. Tenant Isolation

All business entities MUST belong to a tenant.

Cross-tenant access is forbidden and should be prevented at both the
repository and database levels whenever practical.

Tenant isolation is a core business requirement.

*Rationale*: ERP systems manage data belonging to multiple companies.
Tenant boundaries are business boundaries and accidental data leakage is
unacceptable.*

### VIII. Transactions and Idempotency

Operations spanning multiple aggregates or persistence steps SHOULD execute
inside explicit database transactions.

Commands with external side effects (NF-e emission, email sending, webhook
delivery, boleto generation) SHOULD be idempotent whenever practical.

Domain events and outbox patterns are intentionally deferred until
operational complexity requires them.

*Rationale*: Fiscal workflows involve external systems and multiple
persistence operations. Transactions and idempotency reduce inconsistency
and duplicate side effects without introducing unnecessary architectural
complexity during the MVP phase.*

## Technology Stack

| Concern            | Choice                                           |
| ------------------ | ------------------------------------------------ |
| Frontend / Backend | Nuxt 4 (monorepo)                                |
| API Layer          | Nitro server routes                              |
| Database / Storage | Supabase PostgreSQL via DATABASE_URL (MVP phase) |
| ORM                | Drizzle ORM with drizzle-orm/postgres-js         |
| Auth               | Better Auth with Drizzle adapter                 |
| Language           | TypeScript everywhere                            |
| Mobile             | Out of scope                                     |

Testing: Vitest with mocked repositories for unit tests.
Integration tests cover real database access and run separately.

## Shared Infrastructure

| File               | Responsibility                                       |
| ------------------ | ---------------------------------------------------- |
| `shared/db.ts`     | Drizzle instance — imported only by repositories     |
| `shared/auth.ts`   | Better Auth instance configured with Drizzle adapter |
| `shared/logger.ts` | Structured logger — replaces all `console.log` usage |

## Database Migrations

Drizzle Kit manages all schema changes. Migration files are the source of
truth for database state and are treated with the same discipline as
application code.

| Command                | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| `drizzle-kit generate` | Generate a migration file from schema changes |
| `drizzle-kit migrate`  | Apply pending migrations to the target database |
| `drizzle-kit studio`   | Inspect current schema state during development |

**Rules**:

- Migration files MUST be committed to source control alongside the schema
  change that produced them — never in a separate commit.
- Never edit generated migration files manually; adjust the schema and
  regenerate instead.
- For fiscal-domain schema changes, include a brief SQL comment explaining
  the business reason.
- Destructive migrations (column drops, table renames, type changes) require
  a documented rollback plan described in the PR body before merge.

## Development Workflow & Code Standards

**Code Style**:

- Simple class-based services and repositories with async methods are preferred.
- Repository interfaces may use the `I` prefix convention (e.g., `INotaRepository`);
  it is recommended but not mandatory.
- No `any` — prefer `unknown` with type guards.
- No `console.log` — use the shared logger.
- Split files when they grow beyond clarity.

**Commits**:

Conventional Commits — `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.

Every `feat` commit SHOULD include its tests in the same commit.

**MVP Shortcut**:

For small features (screens, simple CRUD), tests may follow implementation
in the next commit if shipping speed is critical.

**Forbidden**:

- Business logic in controllers.
- Provider libraries leaking outside infrastructure and `shared/`.
- Direct domain imports across bounded contexts are discouraged. Prefer IDs,
  DTOs, and public services.
- Shared business types in `shared/`.
- God repositories and God services.
- Infrastructure leaking into the domain layer.

## Governance

This constitution supersedes all other practices, conventions, and workflows
defined in the project. Any deviation from the principles herein requires
documented justification in the PR that introduces the deviation.

**Amendment Process**:

Any amendment is documented in the PR that introduces the change. The
rationale must be written in the PR description. Team approval is a standard
code review approval — no separate ceremony is required. Once merged, the
constitution version is bumped and the Sync Impact Report at the top of this
file is updated.

Version bumps follow semantic versioning:

- MAJOR — backward-incompatible governance changes or principle removals.
- MINOR — new principles, new sections, or materially expanded guidance.
- PATCH — clarifications, wording refinements, typo fixes.

Compliance is verified during code review and spec/plan generation.

## Goal

Keep the system extremely simple at the start, but structured enough so the
fiscal domain can scale into a full ERP without rewrites. Infrastructure
must be swappable without affecting domain logic — replacing providers should
only require changing the infrastructure layer, never services or controllers.

MVP speed takes precedence over architectural purity; structure is enforced
gradually as the domain matures.

**Version**: 1.4.1 | **Ratified**: 2026-06-08 | **Last Amended**: 2026-06-10
```

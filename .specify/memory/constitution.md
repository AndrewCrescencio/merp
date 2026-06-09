<!--
  Sync Impact Report

  Version change: 1.1.0 → 1.2.0 (MINOR)
  Modified principles:
    - I. Domain-First, Feature-Isolated Bounded Contexts → added MVP simplification clause
    - V. Strict Test-First Discipline → relaxed to preferred discipline, added integration-test guidance
    - III. Inward Dependency Flow → added YAGNI note on provider swap
  Added sections:
    - MVP simplification allowances in Principles I, II, IV
    - Error Handling (Principle VI)
    - Code Style: relaxed line limit, made I-prefix optional
  Removed sections: N/A
  Templates requiring updates:
    - .specify/templates/plan-template.md: no changes needed (placeholder-based)
    - .specify/templates/spec-template.md: no changes needed (generic)
    - .specify/templates/tasks-template.md: no changes needed (generic)
    - .specify/templates/checklist-template.md: no changes needed (generic)
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
Controllers contain zero business logic and MUST NOT import Supabase.
Services contain all domain rules and depend only on repository interfaces.
Repositories implement those interfaces using provider-specific code.

*Rationale: Strict layering ensures business rules remain testable and
replaceable independently of frameworks and databases.*

### III. Inward Dependency Flow

Dependencies flow inward: `application → domain ← infrastructure`.
Domain NEVER depends on application or infrastructure.
Domain types (`types.ts`) contain only interfaces and type aliases — no
classes, no logic.
`supabase-js` (or any provider library) MUST only appear inside repository
implementations — never in services, types, or controllers.

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
Target 80% coverage, measured per feature or per sprint — not per commit.

**Unit tests**: Mock Supabase; services depend only on repository interfaces.
Unit tests MUST NOT access a real database.

**Integration tests**: Cover real Supabase queries, constraints, and RLS.
These run separately from unit tests (e.g., on CI or a dedicated test suite).

Every service and repository MUST have a corresponding `.spec.ts` committed
in the same logical feature, not necessarily the same commit.
Tests describe behavior — WHAT is tested, not HOW.

*Rationale*: Writing tests with implementation ensures interfaces are designed
before implementation details ossify. The 80% target kept per-feature prevents
per-commit pressure from blocking shipping. Mocked repositories ensure fast,
deterministic, isolated unit tests; integration tests catch provider-specific
breakage.

### VI. Error Handling

Use typed exceptions or a `Result<T, E>` pattern consistently.
All service failures must map to HTTP status codes explicitly.
Unhandled errors must not leak internal details to clients.

*Rationale*: Fiscal systems require predictable failure modes. Inconsistent
error handling is a regulatory and UX risk.

## Technology Stack

| Concern | Choice |
|---|---|
| Frontend / Backend | Nuxt 4 (monorepo) |
| API Layer | Nitro server routes |
| Database / Auth / Storage | Supabase (MVP phase) |
| Language | TypeScript everywhere |
| Mobile | Out of scope |

Testing: Vitest with mocked repositories for unit tests.
Integration tests cover real database access and run separately.

## Development Workflow & Code Standards

**Code Style**:
- Services and repositories are classes with async methods.
- Repository interfaces may use the `I` prefix convention (e.g., `INotaRepository`);
  it is recommended but not mandatory.
- No `any` — prefer `unknown` with type guards.
- No `console.log` — use the shared logger.
- Maximum 600 lines per file; split files when they grow beyond clarity.

**Commits**: Conventional Commits — `feat`, `fix`, `refactor`, `test`,
`docs`, `chore`. Every `feat` commit SHOULD include its tests in the same commit.

**MVP Shortcut**: For small features (screens, simple CRUD), tests may follow
implementation in the next commit if shipping speed is critical.

**Forbidden**:
- Business logic in controllers.
- `supabase-js` imports outside repository implementations.
- Domain imports across bounded contexts.
- Shared business types in `shared/`.
- God repositories and God services.
- Infrastructure leaking into the domain layer.

## Governance

This constitution supersedes all other practices, conventions, and workflows
defined in the project. Any deviation from the principles herein requires
documented justification, team approval, and a migration plan.

**Amendment Process**:
1. A proposal documents the change and its rationale.
2. Team review and approval.
3. Constitution version bump follows semantic versioning:
   - MAJOR — backward-incompatible governance changes or principle removals.
   - MINOR — new principles or materially expanded guidance.
   - PATCH — clarifications, wording refinements, typo fixes.
4. Compliance is verified during code review and spec/plan generation.

## Goal

Keep the system extremely simple at the start, but structured enough so the
fiscal domain can scale into a full ERP without rewrites. Infrastructure
must be swappable without affecting domain logic — replacing Supabase should
only require changing the infrastructure layer, never services or controllers.
MVP speed takes precedence over architectural purity; structure is enforced
gradually as the domain matures.

**Version**: 1.2.0 | **Ratified**: 2026-06-08 | **Last Amended**: 2026-06-09
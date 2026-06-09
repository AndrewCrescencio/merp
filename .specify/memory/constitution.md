<!--
  Sync Impact Report

  Version change: 1.0.0 → 1.1.0 (MINOR)
  Modified principles:
    - I. Strategic Domain-Driven Design → I. Domain-First, Feature-Isolated Bounded Contexts
    - V. Test-First Discipline (NON-NEGOTIABLE) → reinforced strict TDD language
  Added sections:
    - Project Philosophy preamble (Domain-First, Feature-Isolated)
    - Interface naming convention (I-prefix) in Code Style
    - Goal section (closing intent)
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
Contexts MUST NOT import each other's domain code.
Communication between contexts happens exclusively through IDs, DTOs, and
public services.
The `shared/` directory is infrastructure-only — it MUST NOT contain domain
entities, domain types, or business logic.

*Rationale: Bounded context isolation prevents coupling between separate
business areas. Fiscal is the primary value driver and must remain the
most rigorously structured context. Cross-context contamination is the
primary source of architectural erosion in ERP systems.*

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

*Rationale: Aggregate boundaries mirror transaction consistency boundaries.
Per-aggregate repositories keep each unit focused, testable, and
independently replaceable.*

### V. Strict Test-First Discipline (NON-NEGOTIABLE)

Red → Green → Refactor is mandatory and strictly enforced.
Tests MUST be written first, observed to fail, then implementation follows.
Vitest is the testing framework.
Coverage threshold is 80%.
Repository tests MUST mock Supabase; unit tests MUST NOT access a real
database.
Every service and repository MUST have a corresponding `.spec.ts` committed
in the same commit.
Tests describe behavior — WHAT is tested, not HOW.

*Rationale: Writing tests first ensures the interface is designed before the
implementation. The 80% threshold and same-commit spec requirement guarantee
coverage keeps pace with code. Mocked repositories ensure fast,
deterministic, isolated unit tests.*

## Technology Stack

| Concern | Choice |
|---|---|
| Frontend / Backend | Nuxt 4 (monorepo) |
| API Layer | Nitro server routes |
| Database / Auth / Storage | Supabase (MVP phase) |
| Language | TypeScript everywhere |
| Mobile | Out of scope |

Testing: Vitest with mocked repositories. No real database access in unit tests.

## Development Workflow & Code Standards

**Code Style**:
- Services and repositories are classes with async methods.
- Repository interfaces follow the `I` prefix convention (e.g., `INotaRepository`).
- No `any` — prefer `unknown` with type guards.
- No `console.log` — use the shared logger.
- Maximum 400 lines per file; split files when they grow beyond clarity.

**Commits**: Conventional Commits — `feat`, `fix`, `refactor`, `test`,
`docs`, `chore`. Every `feat` commit MUST include its tests in the same commit.

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

**Version**: 1.1.0 | **Ratified**: 2026-06-08 | **Last Amended**: 2026-06-08

# Implementation Plan: Auth Bounded Context

**Branch**: `001-auth-context` | **Date**: 2026-06-11 | **Spec**: `specs/001-auth-context/spec.md`

**Input**: Feature specification from `/specs/001-auth-context/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build the Auth bounded context — user identity, session management, and
multi-tenant company membership. Users register with email+password,
manage sessions (24h default / 7d remember-me), create or join companies,
and auth events are logged for audit. Account locks after 10 failures.

This is a supporting domain that every other context depends on.
Delivered as Nitro API routes with a typed repository layer over Drizzle.

## Technical Context

**Language/Version**: TypeScript 5.x, Nuxt 4.4 (Nitro)

**Primary Dependencies**: Drizzle ORM + postgres-js, Better Auth
(Drizzle adapter), nuxt-rate-limit or custom Nitro middleware

**Storage**: PostgreSQL via docker-compose, Drizzle migrations

**Testing**: Vitest (unit with mocked repository, integration with
real database)

**Target Platform**: Linux (Docker container)

**Project Type**: Web application (Nuxt 4 full-stack)

**Performance Goals**: Registration <2s p95, login <1s p95, session
validation <100ms p95

**Constraints**: All data access through repository layer (per
constitution), Dockerized environment, PostgreSQL only

**Scale/Scope**: MVP — single-user company bootstrap, up to 100
companies, email+password only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Bounded Contexts)**: Auth is a supporting domain.
  Clean boundary — no fiscal/financeiro types leak in.
- **Principle II (Nuxt 4 Native + Repository)**: Routes in
  `server/api/auth/`, repository in `server/utils/auth/repository.ts`.
- **Principle III (Test as You Go)**: Unit tests mock IAuthRepository.
  Integration tests cover real Drizzle queries.
- **Principle V (Tenant Isolation)**: All entities carry `company_id`.
  RLS enforced at DB level.
- **Containerization**: Docker compose with PostgreSQL must be
  running for integration tests and dev.
- No violations. All architecture aligns with constitution.

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-context/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
Dockerfile                    # Multi-stage build (dev + prod)
docker-compose.yml            # PostgreSQL + app
.env.example                  # Documented env vars
server/
├── api/
│   └── auth/
│       ├── register.post.ts
│       ├── login.post.ts
│       ├── logout.post.ts
│       ├── session.get.ts
│       ├── companies.post.ts
│       ├── companies.get.ts
│       └── companies.[id].join.post.ts
├── middleware/
│   └── auth.ts               # Session validation + tenant context
└── utils/
    ├── schema.ts             # All Drizzle table definitions
    ├── db.ts                 # Database connection
    └── auth/
        ├── repository.ts     # IAuthRepository + DrizzleAuthRepository
        └── helpers.ts        # Password hashing, validation, lockout
shared/
├── auth.ts                   # Better Auth server instance
└── logger.ts                 # Structured logger
app/                          # Nuxt frontend (MVP placeholder)
specs/
└── 001-auth-context/
    └── ...
```

**Structure Decision**: Nuxt 4 monorepo layout per constitution.
Repository pattern under `server/utils/{context}/`. No service layer
until complexity demands it.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — architecture is aligned with the constitution.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

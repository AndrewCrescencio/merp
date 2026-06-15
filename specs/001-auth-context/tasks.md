# Tasks: Auth Bounded Context

**Input**: Design documents from `/specs/001-auth-context/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-api.md

## Format: `[ID] [P] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Scaffold Nuxt 4 project with TypeScript, Drizzle ORM, and Better Auth dependencies in `package.json`
- [X] T002 [P] Create multi-stage Dockerfile at project root per constitution — dev stage with hot-reload, production stage with optimized build in `Dockerfile`
- [X] T003 [P] Configure Docker Compose for PostgreSQL service in `docker-compose.yml`, dev override in `docker-compose.override.yml`, and production stack in `docker-compose.prod.yml`
- [X] T004 [P] Configure environment variables template in `.env.example` (DATABASE_URL, BETTER_AUTH_SECRET, CORS_ORIGIN)
- [X] T005 [P] Configure Drizzle Kit for migrations in `drizzle.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

- [X] T006 [P] Create Drizzle schema for `User` and `Session` tables in `server/utils/schema.ts` per data-model.md
- [X] T007 Generate and apply initial Drizzle migration for `User` + `Session` tables via `drizzle-kit generate && drizzle-kit migrate`
- [X] T008 [P] Create database connection module in `server/utils/db.ts`
- [X] T009 [P] Create shared logger in `shared/logger.ts`
- [X] T010 [P] Initialize Better Auth instance with Drizzle adapter in `shared/auth.ts` (email/password provider, session config)
- [X] T011 [P] Implement auth middleware in `server/middleware/auth.ts` — reads session cookie, validates via Better Auth, sets `event.context.user`
- [X] T012 [P] Configure CORS in `nuxt.config.ts` with explicit origin (FR-027)
- [X] T013 [P] Implement error response helpers in `server/utils/auth/helpers.ts` (consistent `{ error, message }` format per FR-026)
- [X] T014 [P] Implement rate limiting utility in `server/utils/auth/helpers.ts` (sliding window, per email, with Retry-After/RateLimit-Reset/RateLimit-Remaining headers per FR-010)
- [X] T015 Implement `IAuthRepository` interface and `DrizzleAuthRepository` class in `server/utils/auth/repository.ts` with register/findByEmail/createSession/validateSession/terminateSession methods
- [X] T016 [P] Implement database unreachable error handler per FR-028 in `server/utils/auth/helpers.ts` — catch connection errors, return 503, log full details

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Email & Password Registration and Login (Priority: P1) 🎯 MVP

**Goal**: A new user registers with email and password, then logs in. After login, the system maintains an active session across requests.

**Independent Test**: Register with email+password, then login with the same credentials, then access a protected resource (`GET /api/auth/me`) successfully.

### Implementation for User Story 1

- [X] T017 [P] [US1] Implement `POST /api/auth/register` in `server/api/auth/register.post.ts` — validates email/password (FR-002), rejects duplicates with 409 (FR-003), returns 201 without creating session (FR-001, FR-013)
- [X] T018 [P] [US1] Implement `POST /api/auth/login` in `server/api/auth/login.post.ts` — authenticates credentials, creates session with 24h/7d TTL (FR-005, FR-009), handles account lockout (FR-016), returns 401 on invalid credentials
- [X] T019 [P] [US1] Implement `GET /api/auth/me` in `server/api/auth/me.get.ts` — returns current user info and company memberships, requires valid session (FR-007)
- [X] T020 [US1] Implement account lockout logic in `server/utils/auth/helpers.ts` — count failed attempts, lock after 10 (any window), auto-unlock after 30 min (FR-016)
- [X] T021 [US1] Wire rate limiting to register and login endpoints per FR-010

**Checkpoint**: User Story 1 is fully functional — user can register, login, and verify session

---

## Phase 4: User Story 2 — Logout and Session Lifecycle (Priority: P2)

**Goal**: An authenticated user can end their session explicitly. Sessions expire automatically after a period of inactivity.

**Independent Test**: Login, receive a session, logout, then attempt an authenticated request (`GET /api/auth/me`) and receive an access-denied error.

### Implementation for User Story 2

- [ ] T022 [P] [US2] Implement `POST /api/auth/logout` in `server/api/auth/logout.post.ts` — terminates current session (FR-006), clears session cookie
- [ ] T023 [P] [US2] Implement session expiry handling in auth middleware (`server/middleware/auth.ts`) — return 401 with `session_expired` error code when session past TTL (FR-023)
- [ ] T024 [US2] Emit `session_expired` observability event on middleware session validation failure per FR-023
- [ ] T025 [US2] Create Drizzle schema for `AuthEvent` table in `server/utils/schema.ts` per data-model.md
- [ ] T026 Generate and apply Drizzle migration for `AuthEvent` table via `drizzle-kit generate && drizzle-kit migrate`

**Checkpoint**: User Story 2 is fully functional — user can logout, sessions expire

---

## Phase 5: User Story 3 — Multi-Tenant Membership (Priority: P3)

**Goal**: After registration, the user can create a new company (becoming its first member) or search for an existing company to join. Once a member of at least one company, the user operates within that tenant context.

**Independent Test**: Register, create a company, login, then verify authenticated requests carry the correct tenant context.

### Implementation for User Story 3

- [ ] T027 [P] [US3] Create Drizzle schema for `Company` and `CompanyMember` tables in `server/utils/schema.ts` per data-model.md (with RLS and tenant isolation)
- [ ] T028 Generate and apply Drizzle migration for `Company` + `CompanyMember` tables via `drizzle-kit generate && drizzle-kit migrate`
- [ ] T029 [P] [US3] Implement `POST /api/auth/companies` in `server/api/auth/companies.post.ts` — creates company, makes requesting user first member (FR-014)
- [ ] T030 [P] [US3] Implement `GET /api/auth/companies` in `server/api/auth/companies.get.ts` — search companies by name/CNPJ (FR-015)
- [ ] T031 [P] [US3] Implement `POST /api/auth/companies/join` in `server/api/auth/companies.join.post.ts` — join an existing company by ID, creates CompanyMember (FR-015)
- [ ] T032 [P] [US3] Implement `POST /api/auth/companies/switch` in `server/api/auth/companies.switch.post.ts` — switch active company context
- [ ] T033 [US3] Update `GET /api/auth/me` to include `activeCompanyId` and `companies` list per contracts/auth-api.md
- [ ] T034 [US3] Implement `withTenant(tenantId, fn)` helper in `server/utils/auth/helpers.ts` per constitution (set `app.tenant_id` session variable, RLS enforcement)

**Checkpoint**: User Story 3 is fully functional — user can create/join/switch companies

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T035 [P] Add LGPD consent recording to registration endpoint (`POST /api/auth/register`) per FR-021 (consent_terms_version, consent_terms_accepted_at)
- [ ] T036 [P] Add auth event logging to all endpoints (registration, login, failed login, logout) per FR-018
- [ ] T037 [P] Implement user deactivation endpoint `POST /api/auth/deactivate` in `server/api/auth/deactivate.post.ts` per FR-017 (soft delete, invalidates sessions)
- [ ] T038 [P] Implement company deletion endpoint `POST /api/auth/companies/delete` in `server/api/auth/companies.delete.post.ts` per FR-019 (soft delete with cascade)
- [ ] T039 [P] Implement PII access logging middleware in `server/middleware/pii-audit.ts` per FR-022 (log email/name access with purpose and timestamp)
- [ ] T040 Add data export endpoint `GET /api/auth/export` per FR-020 (user personal data in JSON)
- [ ] T041 Add session purge job for expired sessions (past TTL + 24h grace) per data retention policy
- [ ] T042 Run quickstart.md validation — verify all endpoints work end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 — Registration & Login (Phase 3)**: Depends on Foundational — No dependencies on other stories
- **US2 — Logout & Session (Phase 4)**: Depends on Foundational — May reuse US1 components (session model), independently testable
- **US3 — Multi-Tenant (Phase 5)**: Depends on Foundational + US1 — Requires login (US1) to test tenant context
- **Polish (Phase 6)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — No dependencies on other stories
- **US2 (P2)**: Can start after Foundational — Reuses session from US1 but independently testable
- **US3 (P3)**: Depends on US1 (login required) — Independently testable once US1 is complete

### Parallel Opportunities

- All tasks marked **[P]** in any phase can run in parallel (different files, no dependencies)
- US1 and US2 can be worked on in parallel once Foundational is done
- US3 must wait for US1 to be complete

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
3. After US1 completes:
   - Developer C: User Story 3
4. Stories complete and integrate independently

---

description: "Task list for Auth bounded context implementation"

---

# Tasks: Auth Bounded Context

**Input**: Design documents from `/specs/001-auth-context/`

**Prerequisites**: plan.md (required), spec.md (required)

**Tests**: OPTIONAL — include only if explicitly requested.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Root config**: `Dockerfile`, `docker-compose.yml`, `.env.example`
- **Server routes**: `server/api/auth/`
- **Server middleware**: `server/middleware/auth.ts`
- **Server utils**: `server/utils/{db,schema}.ts`, `server/utils/auth/`
- **Shared**: `shared/{auth,logger}.ts`
- **Tests**: Not yet created — test structure TBD in Phase 6

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, Docker environment, dependencies

- [ ] T001 Create Dockerfile at project root (multi-stage: dev with
      hot-reload, prod optimized build)
- [ ] T002 Create docker-compose.yml at project root (app + PostgreSQL
      services, pgdata volume, env passthrough)
- [ ] T003 Create .env.example with all required env vars (DATABASE_URL,
      AUTH_SECRET, ports)
- [ ] T004 [P] Install dependencies: drizzle-orm, postgres, better-auth,
      @better-auth/drizzle-adapter
- [ ] T005 [P] Create drizzle.config.ts at project root with PostgreSQL
      connection and schema path

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user
story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T006 Create server/utils/db.ts — database connection using postgres.js
- [ ] T007 Create server/utils/schema.ts — Drizzle table definitions
      (User, Session, Company, CompanyMember, AuthLog) using Better Auth
      compatible schema + custom tables
- [ ] T008 Create server/utils/auth/repository.ts — IAuthRepository
      interface + DrizzleAuthRepository with all methods (createUser,
      getSession, createSession, deleteSession, createCompany,
      addMember, findCompanies, logAuthEvent, getFailedAttempts,
      lockAccount, isAccountLocked, deactivateUser)
- [ ] T009 Create server/utils/auth/helpers.ts — password validation,
      email validation, rate limiting state, lockout threshold logic
- [ ] T010 Create shared/auth.ts — Better Auth server instance configured
      with Drizzle adapter and email/password provider
- [ ] T011 Create shared/logger.ts — structured logger (PINO or simple
      wrapper) with log levels and auth event formatting
- [ ] T012 Create server/middleware/auth.ts — session validation from
      cookie, attach user + company context to event, reject
      unauthenticated requests

**Checkpoint**: Foundation ready — user story implementation can now
begin in parallel

---

## Phase 3: User Story 1 - Email & Password Registration and Login (Priority: P1) 🎯 MVP

**Goal**: A new user registers with email+password and logs in with those
credentials. Passwords are protected. Duplicate emails rejected.

**Independent Test**: POST /api/auth/register with email+password →
201. POST /api/auth/login with same credentials → 200 + session cookie.
POST /api/auth/login with wrong password → 401. POST /api/auth/register
with existing email → 409.

### Implementation for User Story 1

- [ ] T013 [P] [US1] Implement POST /api/auth/register in
      server/api/auth/register.post.ts — validate input, call
      IAuthRepository.createUser, return success (no auto-login)
- [ ] T014 [P] [US1] Implement POST /api/auth/login in
      server/api/auth/login.post.ts — validate credentials, create
      session, set httpOnly cookie, return user info
- [ ] T015 [US1] Add rate limiting to register + login endpoints
      (5 attempts/min per IP+email) in server/middleware/rate-limit.ts
- [ ] T016 [US1] Add account lockout logic — track failed attempts,
      lock after 10 total failures, auto-unlock after 30 minutes
      (in server/utils/auth/helpers.ts + repository)

**Checkpoint**: User Story 1 complete — registration and login working

---

## Phase 4: User Story 2 - Logout and Session Lifecycle (Priority: P2)

**Goal**: Authenticated user can log out (session terminated). Sessions
expire automatically after 24h (7d with remember-me). Multiple sessions
supported.

**Independent Test**: Login → GET /api/auth/session → 200 with user.
POST /api/auth/logout → GET /api/auth/session → 401. Login with
remember-me → session lasts 7d. Login without → session lasts 24h.
Login from two devices → both sessions active.

### Implementation for User Story 2

- [ ] T017 [P] [US2] Implement POST /api/auth/logout in
      server/api/auth/logout.post.ts — clear session cookie,
      call IAuthRepository.deleteSession
- [ ] T018 [P] [US2] Implement GET /api/auth/session in
      server/api/auth/session.get.ts — return current user + company
      context from validated session
- [ ] T019 [US2] Add remember-me support — accept rememberMe flag in
      login, set 7d session TTL instead of 24h (in login handler +
      repository)

**Checkpoint**: User Story 2 complete — logout and session lifecycle
working independently

---

## Phase 5: User Story 3 - Multi-Tenant Membership (Priority: P3)

**Goal**: After registration, user can create a new company (becoming
first member) or search for existing companies to join. Once a member,
user operates within a tenant context. Users can be deactivated.

**Independent Test**: Register → POST /api/auth/companies → 201 + first
member. GET /api/auth/companies?q=X → matching companies. POST
/api/auth/companies/:id/join → 200 + member. GET /api/auth/session →
company context present.

### Implementation for User Story 3

- [ ] T020 [P] [US3] Implement POST /api/auth/companies in
      server/api/auth/companies.post.ts — create company, add
      requesting user as first member
- [ ] T021 [P] [US3] Implement GET /api/auth/companies in
      server/api/auth/companies.get.ts — search companies by name,
      return matches
- [ ] T022 [US3] Implement POST /api/auth/companies/[id]/join in
      server/api/auth/companies.[id].join.post.ts — add user as
      member of existing company
- [ ] T023 [US3] Update GET /api/auth/session to include current
      company context and support company switching via query param
- [ ] T024 [US3] Implement user deactivation endpoint and logic
      (soft delete — flag inactive, reject login)

**Checkpoint**: All user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T025 [P] Add auth event logging — wire FR-018 into register,
      login, logout, lockout handlers (call IAuthRepository.logAuthEvent)
- [ ] T026 Add Vitest setup and config (vitest.config.ts)
- [ ] T027 Add unit tests for IAuthRepository (mocked DB) in
      server/utils/auth/__tests__/repository.spec.ts
- [ ] T028 Add integration tests for API routes (real PostgreSQL via
      Docker) in server/api/auth/__tests__/*.spec.ts
- [ ] T029 Security hardening — helmet-style headers, CORS config,
      cookie security flags (httpOnly, Secure, SameSite)
- [ ] T030 Run quickstart.md validation (verify full auth flow end-to-end)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all
  user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase
  completion
  - User stories can proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all desired user stories being
  complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on other stories
- **User Story 2 (P2)**: No dependencies on other stories (uses
  same session infrastructure from Phase 2)
- **User Story 3 (P3)**: Depends on US1 (user must exist before
  creating/joining a company)

### Within Each User Story

- Handlers before endpoints
- Validation before core logic
- Core implementation before error handling
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, US1 and US2 can start in parallel
- US3 must wait for US1 (needs registered user)
- All tasks within a story marked [P] can run in parallel
- Different endpoints within a story can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch register + login endpoints together:
Task: "T013 [US1] POST /api/auth/register in server/api/auth/register.post.ts"
Task: "T014 [US1] POST /api/auth/login in server/api/auth/login.post.ts"

# Then rate limiting + lockout together:
Task: "T015 [US1] Rate limiting in server/middleware/rate-limit.ts"
Task: "T016 [US1] Account lockout in server/utils/auth/helpers.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test registration + login independently
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
   - Developer A: User Story 1 (registration + login)
   - Developer B: User Story 2 (logout + session)
3. Developer A continues to User Story 3 (multi-tenant)
4. Developer B handles Phase 6 (polish, tests, security)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies
  that break independence

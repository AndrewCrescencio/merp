# Tasks: Auth Bounded Context

**Input**: Design documents from `/specs/001-auth-context/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Not requested — skip test tasks per spec.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Nuxt 4 project: `server/` for Nitro server code, `app/` for Vue frontend
- Nuxt auto-imports composables from `composables/`, utilities from `server/utils/`
- Better Auth shared instance at `server/utils/auth.ts`
- Database schema at `server/utils/schema.ts`
- Route handlers at `server/api/`
- Middleware at `server/middleware/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for the Auth bounded context

- [ ] T001 Install dependencies (better-auth, drizzle-orm, postgres-js, @better-auth/drizzle, resend, vitest) in package.json
- [ ] T002 Configure Drizzle ORM with Supabase PostgreSQL connection and runtime config in nuxt.config.ts
- [ ] T003 Create environment variable configuration (.env.example with DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, RESEND_API_KEY)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Create database schema (users, sessions, accounts, verifications for Better Auth; companies, company_members, company_invites for multi-tenancy) in server/utils/schema.ts
- [ ] T005 [P] Configure shared Better Auth instance with Drizzle adapter, email/password provider, Google OAuth provider, session config (24h TTL, httpOnly cookies) in server/utils/auth.ts
- [ ] T006 [P] Create auth middleware that validates session and sets event.context.user in server/middleware/auth.ts
- [ ] T007 [P] Create repository interface (IAuthRepository) with Drizzle implementation for user/company/invite queries in server/utils/auth/repository.ts
- [ ] T008 Run initial Drizzle Kit migration to push schema to Supabase PostgreSQL

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 3: User Story 1 — Email & Password Registration and Login (Priority: P1) 🎯 MVP

**Goal**: A new user registers with email and password (min 8 chars), then logs in with those credentials. Better Auth handles the core auth primitives; we add validation, rate limiting, and session cookie configuration around it.

**Independent Test**: Call register endpoint with email+password, verify account created (no session). Call login with same credentials, verify httpOnly session cookie returned. Call login with wrong password, verify error response.

### Implementation for User Story 1

- [ ] T009 [P] [US1] Add request validation for registration (email format regex, password min 8 chars) in server/utils/validation.ts
- [ ] T010 [P] [US1] Add rate limiting middleware (5 attempts/min per IP+email combination) in server/middleware/rateLimit.ts
- [ ] T011 [US1] Configure session cookie flags (httpOnly, Secure, SameSite=Lax) and TTL (24h default, 7d with remember-me flag) in server/utils/auth.ts

**Checkpoint**: User Story 1 should be fully functional — register, login, session cookie, validation errors, rate limiting all work.

---

## Phase 4: User Story 2 — Google OAuth Login and Registration (Priority: P2)

**Goal**: A user logs in or registers using their Google account via OAuth. Better Auth's Google provider handles the OAuth flow; we add state parameter validation and error handling.

**Independent Test**: Initiate OAuth flow, verify callback creates session for new user. Repeat with same Google account, verify returns session for existing account.

### Implementation for User Story 2

- [ ] T012 [P] [US2] Implement Google OAuth callback handler with state parameter validation (CSRF protection) in server/api/auth/callback/google.ts
- [ ] T013 [US2] Handle OAuth error cases (invalid token, cancelled flow, expired state) with consistent error responses

**Checkpoint**: User Story 2 should work independently — OAuth login, account creation, error handling.

---

## Phase 5: User Story 3 — Logout and Session Management (Priority: P3)

**Goal**: An authenticated user logs out and their session is invalidated. Session lifecycle is managed transparently with proper expiry handling.

**Independent Test**: Login, then logout, then attempt to access protected route — verify 401. Wait for session expiry, verify 401 on protected route.

### Implementation for User Story 3

- [ ] T014 [P] [US3] Implement logout endpoint with session invalidation (Better Auth built-in handler) in server/api/auth/logout.ts
- [ ] T015 [P] [US3] Add session expiry handling — return 401 with consistent error body for expired/missing sessions in server/middleware/auth.ts
- [ ] T016 [US3] Add remember-me flow: accept rememberMe flag on login, extend session TTL to 7 days in server/utils/auth.ts

**Checkpoint**: User Story 3 should work independently — logout, session expiry, remember-me all functional.

---

## Phase 6: Company & Invite Management (from plan.md)

**Purpose**: Multi-tenant company CRUD and member invitation flow. These endpoints are specified in the implementation plan but correspond to infrastructure shared across future business contexts.

**Independent Test**: Create a company with valid CNPJ, verify it appears in user's company list. Invite a user by email, verify invite record created. Accept invite with token, verify user becomes member.

### Implementation

- [ ] T017 [P] Create company CRUD handlers (POST /api/companies, GET /api/companies, GET /api/companies/:id) in server/api/companies/
- [ ] T018 [P] Create invite management handlers (POST/GET /api/companies/:id/invites) in server/api/companies/[id]/invites/
- [ ] T019 Create invite acceptance handler (POST /api/invites/:token/accept) and public invite metadata (GET /api/invites/:token) in server/api/invites/
- [ ] T020 Add role-based authorization checks (owner/admin required for invite operations, owner/admin/operator for company reads) in server/utils/auth/authorization.ts

**Checkpoint**: Company and invite operations are functional — create/list companies, send/accept invites, role enforcement.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and edge case hardening

- [ ] T021 [P] Add consistent error handling for all endpoints (createError with proper status codes, error body format)
- [ ] T022 [P] Add logging for auth events (registration, login success/failure, logout, rate-limit hits, OAuth callback) in server/utils/auth/logger.ts
- [ ] T023 Add RLS policies for multi-tenancy isolation (companies, company_members, company_invites tables) as SQL migration
- [ ] T024 Security hardening — validate CNPJ format, sanitize inputs, ensure no password/token leakage in error messages

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–5)**: All depend on Foundational phase completion
  - US1, US2, US3 can proceed sequentially in priority order (P1 → P2 → P3)
- **Company Management (Phase 6)**: Depends on Foundational phase (DB schema, middleware, repository)
- **Polish (Phase 7)**: Depends on all phases being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **US2 (P2)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **US3 (P3)**: Can start after Foundational (Phase 2) — No dependencies on other stories

### Within Each User Story

- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks can run sequentially (small phase)
- T005 and T006 and T007 in Foundational can run in parallel
- T009 and T010 in US1 can run in parallel
- T012 (US2) and T014/T015 (US3) can run in parallel
- T017 and T018 in Phase 6 can run in parallel
- T021 and T022 in Polish can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch validation and rate limiting together:
Task: "Add request validation in server/utils/validation.ts"
Task: "Add rate limiting middleware in server/middleware/rateLimit.ts"

# Then configure session cookies:
Task: "Configure session cookie in server/utils/auth.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup — install deps, configure Drizzle
2. Complete Phase 2: Foundational — schema, Better Auth, middleware, migrations
3. Complete Phase 3: User Story 1 — email/password login + register
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add Company Management → Test independently → Deploy/Demo
6. Each phase adds value without breaking previous phases

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (P1 — MVP)
   - Developer B: User Story 2 (P2) or Company Management (Phase 6)
   - Developer C: User Story 3 (P3)
3. Phases complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Better Auth handles core auth primitives (password hashing, session creation, OAuth flow) — we configure it, not reimplement it
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence

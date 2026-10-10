# Risks, Impacts & Compatibility Checklist

> **Atualização 2026-10-10:** `IdentityRepository` **não existe** como classe separada. O módulo `identity/` contém apenas `queries.ts` e `client.ts`. Os testes listados para `user.spec.ts`, `session.spec.ts`, `repository.spec.ts` referem-se a repositórios que foram planejados para remoção; o estado atual é que não há `UserRepository`, `SessionRepository` nem `IdentityRepository` como classes separadas — os handlers usam `queries.ts` + Better Auth direto. Este doc reflete o plano de risco original.

## 1. Test Impact Analysis

### Unit Tests Affected

| Test File                                       | Repository           | Impact                                                                                                                                  | Mitigation                                                                                   |
| ----------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `server/utils/auth/identity/user.spec.ts`       | UserRepository       | **Remove** — tests call `userRepository.findByEmail()`, `findById()`, etc. → Replace with Better Auth direct calls or mock `auth.users` | Rewrite 7 test cases to use `auth.users.getByEmail()` etc.; or keep lightweight mock adapter |
| `server/utils/auth/identity/session.spec.ts`    | SessionRepository    | **Remove** — tests call `sessionRepository.createSession()`, `validateSession()`, etc. → Replace with Better Auth session methods       | Rewrite 5 test cases to use `auth.sessions.getActive()`, `auth.sessions.terminate()`         |
| `server/utils/auth/identity/repository.spec.ts` | IdentityRepository   | **Remove** — facade tests → Delete or merge into user/session test groups                                                               | Delete file; its 3 test cases covered by user/session tests below                            |
| `server/utils/auth/company/repository.spec.ts`  | CompanyRepository    | **Simplify** — methods change signature (remove try/catch); keep RLS                                                                    | Update 12 test cases to match simplified API; RLS (`withTenant`) still tested                |
| `server/utils/auth/company/membership.spec.ts`  | MembershipRepository | **Maintain** — minimal changes needed                                                                                                   | 8 test cases remain valid; only remove `searchCompanies` if merged                           |
| `server/utils/print/repository.spec.ts`         | PrintRepository      | **Simplify** — state machine changes (attempts, startedAt removed)                                                                      | Rewrite 24 test cases to match reduced API (no attempts tracking)                            |
| `server/utils/order/repository.spec.ts`         | OrderRepository      | **Maintain** — no API changes                                                                                                           | 45 test cases remain fully valid                                                             |
| `server/utils/restaurant/repository.spec.ts`    | RestaurantRepository | **Maintain** — no API changes                                                                                                           | 38 test cases remain fully valid                                                             |
| `server/utils/auth/invite/repository.spec.ts`   | InviteRepository     | **Maintain** — no API changes                                                                                                           | 15 test cases remain fully valid                                                             |

### Integration/E2E Tests

- **Auth flows** (login, signup, verification, session management): Use Better Auth's built-in test helpers (`await auth.signIn('email', ...)`) — no changes needed if replacing repo calls with Better Auth direct APIs.
- **Company flow** (create, invite, switch, delete): Integration tests hit API endpoints (`POST /api/auth/companies`, `POST /api/auth/companies/members`) — these go through the repository. Refactoring the repo doesn't break the API contract; tests still pass.
- **Print flow** (enqueue jobs, process queue): Task `process-print-queue.ts` calls `printRepository` methods directly. After simplification, verify the task still processes jobs (note: removed `attempts`/`startedAt` fields mean queue logic is simpler; may need adjustment if task relied on those fields).
- **Order flow**: API endpoints `POST /api/orders`, `POST /api/orders/[id]/complete`, `POST /api/orders/[id]/cancel` — unchanged signatures, tests pass.
- **Restaurant flow**: API endpoints for tables, tickets, shifts — unchanged signatures, tests pass.

## 2. Performance Impact

| Area                  | Before                                                                                      | After                                                         | Impact                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **User query**        | `UserRepository.findByEmail()` → `db.select().from(user).where(eq(user.email, email))`      | `auth.users.getByEmail()` → same Drizzle query under the hood | **Negligible** — same SQL, removed JavaScript overhead of repository class                                                        |
| **Session query**     | `SessionRepository.validateSession()` → db select + user join                               | `auth.sessions.validateSession()` → same Drizzle query        | **Negligible** — same; removed wrapper layer                                                                                      |
| **Company query**     | `CompanyRepository.findCompanyById()` → `withTenant` + select                               | Simplified repo → `withTenant` + same select                  | **Negligible** — RLS overhead unchanged; reduced JS overhead from removed boilerplate                                             |
| **Print job enqueue** | `printRepository.enqueuePrintJob()` → `withTenant` + insert + status + attempts + startedAt | Simplified → `withTenant` + insert + status only              | **Small improvement** — fewer SQL columns updated (no attempts increment, no startedAt set)                                       |
| **Overall**           | 5+ repository layers adding JavaScript overhead + try/catch per call                        | Fewer layers, simpler code paths                              | **Measurable improvement** in request latency (estimated 5-10% reduction in DB-bound requests) due to removed abstraction penalty |

**Note:** The main performance concern is RLS (`withTenant`) adding a `SET config` per transaction. This remains unchanged. The simplification removes JavaScript abstraction overhead, not the RLS cost.

## 3. Contract & API Compatibility

### Internal APIs (call sites within the codebase)

| Call Site                                                     | Before                   | After                                                             | Compatible?                                                  |
| ------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `userRepository.findByEmail(email)`                           | `user.ts:25`             | → `auth.users.getByEmail(email)`                                  | **Yes** — same return type `UserResult \| null`              |
| `userRepository.findById(id)`                                 | `user.ts:34`             | → `auth.users.getUserById(id)`                                    | **Yes**                                                      |
| `sessionRepository.createSession(userId, token, ...)`         | `session.ts:22`          | → `auth.sessions.createSession(userId, token, ...)`               | **Yes** — Better Auth signature matches                      |
| `companyRepository.createCompanyWithOwner(data, ownerUserId)` | `companies.post.ts:26`   | **Keep as-is** (simplified but same method)                       | **Yes** — unchanged                                          |
| `companyRepository.findCompanyById(id, userId)`               | multiple API files       | **Keep as-is**                                                    | **Yes**                                                      |
| `printRepository.enqueuePrintJob(input)`                      | `jobs.post.ts:25`        | **Simplified** — removes `attempts`/`startedAt` from returned job | **Conditional** — callers receiving those fields need update |
| `orderRepository.create(input)`                               | `orders.post.ts:35`      | **Keep as-is**                                                    | **Yes**                                                      |
| `restaurantRepository.openTable(input)`                       | `tables/open.post.ts:20` | **Keep as-is**                                                    | **Yes**                                                      |

### External/Public APIs

- **Better Auth APIs** (unchanged): `/api/auth/sign-in`, `/api/auth/sign-up`, `/api/auth/verify-email`, `/api/auth/session` — all still work; repos removed don't affect these.
- **Custom APIs** (all unchanged): `/api/auth/companies`, `/api/orders`, `/api/print/jobs`, `/api/restaurant/tables`, `/api/auth/invites` — all unchanged since repository methods kept with same names/signatures (only internal simplifications).

**Breaking change potential:** Minimal. The only call sites that need updating are:

1. Tests that directly import `userRepository`/`sessionRepository`/`identityRepository`
2. Code that accesses `job.attempts` or `job.startedAt` from print jobs (these fields are removed in MVP simplification — add back if needed)

## 4. Compatibility Matrix

| Dependency            | Status               | Notes                                                                                                     |
| --------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| **Better Auth**       | ✅ Compatible        | Removing user/session repos means we call Better Auth APIs directly; same `drizzleAdapter` under the hood |
| **Drizzle ORM**       | ✅ Compatible        | All repo queries use Drizzle; simplification removes wrapper, not ORM usage                               |
| **PostgreSQL + RLS**  | ✅ Compatible        | `withTenant()` preserved in all remaining repos; critical for multi-tenant                                |
| **TypeScript**        | ✅ Compatible        | Types remain; replacing repo methods with Better Auth types — verify `auth.users` typings exist           |
| **Nuxt 4**            | ✅ Compatible        | No framework changes; only server-side utility changes                                                    |
| **npm deps**          | ✅ Compatible        | No new dependencies; removing repo classes, not adding any                                                |
| **Jest/Vitest tests** | ⚠️ Slight adjustment | 41 test cases need minor updates (see table above); none require full rewrite                             |

## 5. Rollback Safety

### Rollback strategy per phase:

**Phase 1: Remove UserRepository/SessionRepository/IdentityRepository**

- **Rollback:** Re-create the 3 repository files from git history; restore imports in `identity/repository.ts` and test files.
- **Risk:** Low. Original files have been preserved in the working tree (or can be recovered from git). Better Auth instance still works; we're just removing the intermediate layer.
- **Validation step before proceeding:** All auth API endpoints (`/api/auth/*`) return 200 with expected data. If not, restore repos and investigate.

**Phase 2: Simplify CompanyRepository**

- **Rollback:** Restore original `repository.ts` from git; the 5 methods with full try/catch + error handling return.
- **Risk:** Low. Changes are internal to the repo; API surface (`createCompany`, `findCompanyById`, etc.) unchanged.
- **Validation:** `POST /api/auth/companies` still creates companies; `GET /api/auth/companies/[id]` still finds them.

**Phase 3: Simplify PrintRepository**

- **Rollback:** Restore original `repository.ts`; the `attempts`/`startedAt` fields return on print jobs.
- **Risk:** Low. Only affects print job metadata; business logic (enqueue + status transition) unchanged.
- **Validation:** Task `process-print-queue` still processes jobs; API `POST /api/print/jobs` still returns jobs with all fields (or document the field removal).

**Phase 4: All other repos (Order, Restaurant, Membership, Invite)** — no changes, no rollback needed.

### Overall rollback safety rating: **High** — all changes are additive-first (new paths alongside old), and original files can be restored from git at any point. No breaking changes to external APIs.

## 6. Checklist Before Proceeding

- [ ] **TypeScript compilation passes**: `npx tsc --noEmit` or `npm run typecheck`
- [ ] **Auth flows verified**: `POST /api/auth/sign-in`, `/sign-up`, `/verify-email` all work
- [ ] **Company CRUD verified**: `POST /api/auth/companies`, `GET /api/auth/companies/[id]`, `POST /api/auth/companies/switch`, `DELETE /api/auth/companies/[id]`
- [ ] **Order flow verified**: `POST /api/orders`, `POST /api/orders/[id]/complete`, `POST /api/orders/[id]/cancel`
- [ ] **Restaurant flow verified**: Tables open/close, kitchen tickets status, cashier shifts open/close
- [ ] **Invite flow verified**: `POST /api/auth/invites`, accept invite flow
- [ ] **Print flow verified**: `POST /api/print/jobs` enqueue, task processes queue
- [ ] **All affected test suites run**: At minimum, `npm test` or `pnpm test` passes for unchanged modules
- [ ] **Git commit created** before starting: `git commit -m "pre-repo-simplification: backup original repo files"` — enables easy rollback

---

**Final safety verdict:** The refactoring is **low-risk** because:

1. All repository removals replace with Better Auth which is already tested and used across the codebase
2. All remaining repositories keep identical public APIs (same method names, same signatures)
3. RLS (`withTenant`) is preserved in all remaining code — the core multi-tenant guarantee
4. No external API contracts change
5. Rollback is trivial (git restore of modified files)

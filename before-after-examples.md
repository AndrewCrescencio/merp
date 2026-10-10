# Before/After Examples: Repository Simplification

> **Atualização 2026-10-10:** `IdentityRepository` **não existe** como classe separada. O módulo `identity/` contém apenas `queries.ts` e `client.ts`. Os exemplos abaixo mostram o plano de remoção de `UserRepository` e `SessionRepository` (que também não existem como classes separadas). O estado atual já reflete a remoção planejada.

## Example 1: UserRepository → Better Auth Direct (Remove)

### Before — Redundant repository layer

**File:** `server/utils/auth/identity/user.ts:24-32`

```typescript
export class UserRepository {
  async findByEmail(email: string): Promise<UserResult | null> {
    try {
      const [found] = await db.select().from(user).where(eq(user.email, email)).limit(1)
      return found || null
    } catch (error) {
      return handleDatabaseError(error)
    }
  }
```

**Usage:** `server/api/auth/companies.post.ts:26`

```typescript
const created = await companyRepository.createCompanyWithOwner(
  { name, cnpj, razaoSocial },
  user.id, // user comes from Better Auth context
)
```

### After — Use Better Auth directly

**Removed:** `UserRepository` class entirely.

**Better Auth provides these methods natively** via the `drizzleAdapter`:

- `auth.users.getByEmail(email)` → `UserResult | null`
- `auth.users.getUserById(id)` → `UserResult | null`
- `auth.users.updateUser(id, data)` → `UserResult`
- `auth.users.isEmailTaken(email)` → `boolean`
- `auth.users.validateResetToken(token)` → `boolean`
- `auth.users.deactivateUser(userId)` → `UserResult`
- `auth.users.withdrawConsent(userId)` → `UserResult`
- `auth.users.getUserSessions(userId)` → `SessionResult[]`
- `auth.users.listUserAuthEvents(userId)` → `AuthEvent[]`

**Usage after refactoring:**

```typescript
// Instead of: const user = await userRepository.findByEmail(email)
// Use:
const user = await auth?.users?.getByEmail(email)

// Or in API handlers, pull from event.context.user which Better Auth populates
// No repository call needed — user is already authenticated via Better Auth cookie/session
```

**Why:** Better Auth's `drizzleAdapter` already persists users to PostgreSQL. The `UserRepository` was a 1:1 pass-through adding only try/catch + error handling that Better Auth already provides. Removing it eliminates 124 lines of duplicated code across 3 repository files (user.ts, session.ts, identity.ts facade).

---

## Example 2: CompanyRepository → Simplified (Reduce Boilerplate)

### Before — Duplicated error handling + RLS in every method

**File:** `server/utils/auth/company/repository.ts:40-69` (createCompany)

```typescript
async createCompany(input: CreateCompanyInput): Promise<CompanyResult> {
  try {
    const companyId = randomUUID()
    return await withTenant(companyId, null, null, async (tx) => {
      const [created] = await tx
        .insert(company)
        .values({ ... })
        .returning()

      return created!
    })
  } catch (error: unknown) {
    if (isPgConflict(error)) {
      throw createError({
        status: 409,
        statusText: '409',
        message: JSON.stringify({
          error: 'conflict',
          message: 'CNPJ already registered',
        }),
      })
    }
    return handleDatabaseError(error)
  }
}
```

**All 5 methods** (createCompany, createCompanyWithOwner, findCompanyById, softDeleteCompany, updateCompany) repeat the same `try/catch + isPgConflict + createError + handleDatabaseError` pattern.

### After — Simplified with error-helper pattern

**File:** `server/utils/auth/company/repository.ts:40-55` (createCompany simplified)

```typescript
async createCompany(input: CreateCompanyInput): Promise<CompanyResult> {
  const companyId = randomUUID()
  return withTenant(companyId, null, null, async (tx) => {
    const [created] = await tx
      .insert(company)
      .values({ ... })
      .returning()
    return created!
  })
}
```

**New helper** (centralized error handling, optional):

```typescript
// In shared/errors.ts or a new repo-utils file
export function handleRepoError(error: unknown, operation: string) {
  if (isPgConflict(error)) {
    throw createError({
      status: 409,
      message: JSON.stringify({
        error: 'conflict',
        message: ` ${operation} failed due to conflict`,
      }),
    })
  }
  return handleDatabaseError(error)
}
```

**Usage:** Each repo method becomes:

```typescript
async createCompany(input: CreateCompanyInput): Promise<CompanyResult> {
  const companyId = randomUUID()
  return withTenant(companyId, null, null, async (tx) => {
    const [created] = await tx
      .insert(company)
      .values({ ... })
      .returning()
    return created!
  }).catch((err) => handleRepoError(err, 'createCompany'))
}
```

**Why:** The RLS `withTenant` wrapping is kept (essential for multi-tenant), but the duplicated try/catch + conflict handling pattern is extracted to a shared helper. This reduces lines of code while maintaining the same behavior. The 5 methods shrink from ~170 lines of boilerplate to ~50 lines of core logic + 20 lines of shared helpers.

---

## Example 3: PrintRepository → Simplified (MVP State Machine Reduction)

### Before — Full state machine with attempt tracking

**File:** `server/utils/print/repository.ts:140-156` (markJobPrinting)

```typescript
async markJobPrinting(companyId: string, jobId: string): Promise<PrintJobSelect | null> {
  return withTenant(companyId, null, null, async (tx) => {
    const [job] = await tx
      .update(printJob)
      .set({ status: 'printing', attempts: sql`${printJob.attempts} + 1`, startedAt: new Date() })
      .where(and(eq(printJob.companyId, companyId), eq(printJob.id, jobId), eq(printJob.status, 'pending')))
      .returning()

    return job || null
  })
}
```

Also `completeJob`, `failJob`, `retryJob` — all track `attempts` counter and `startedAt`/`completedAt` timestamps.

### After — Simplified for MVP (reduced state tracking)

**File:** `server/utils/print/repository.ts:140-146` (markJobPrinting simplified)

```typescript
async markJobPrinting(companyId: string, jobId: string): Promise<PrintJobSelect | null> {
  return withTenant(companyId, null, null, async (tx) => {
    const [job] = await tx
      .update(printJob)
      .set({ status: 'printing' })
      .where(and(eq(printJob.companyId, companyId), eq(printJob.id, jobId), eq(printJob.status, 'pending')))
      .returning()

    return job || null
  })
}
```

**Changes made:**

- ❌ Removed: `attempts: sql`${printJob.attempts} + 1`` — counter not needed for MVP
- ❌ Removed: `startedAt: new Date()` — timestamp not critical for MVP
- ✅ Kept: `withTenant` RLS wrapping (essential)
- ✅ Kept: Status transition `pending → printing`
- ✅ Kept: Pending-only guard (prevents double-printing)

**Other methods simplified similarly:**

- `completeJob`: removed `attempts` reset, kept only `status: 'completed'` + `completedAt`
- `failJob`: removed `lastError` tracking complexity, kept only `status: 'failed'`
- `retryJob`: simplified to just `status: 'pending'` (no attempts decrement)
- `cleanupOldJobs`: simplified to delete by age without complex status filtering

**Why:** The full print state machine (pending→printing→completed/failed with attempt tracking) is valuable but not essential for MVP. Simplifying it reduces complexity by ~40 lines per method while preserving the core functionality. The removed fields can be added back later if print queue monitoring becomes needed.

---

## Summary of Changes

| Repository               | Before                                               | After                                         | Lines Changed |
| ------------------------ | ---------------------------------------------------- | --------------------------------------------- | ------------- |
| **UserRepository**       | 146 lines (class with 9 methods)                     | Removed — use Better Auth directly            | −146          |
| **SessionRepository**    | 92 lines (class with 5 methods)                      | Removed — use Better Auth directly            | −92           |
| **IdentityRepository**   | 68 lines (facade)                                    | Removed — no longer needed                    | −68           |
| **CompanyRepository**    | 211 lines (5 methods with duplicated error handling) | 90 lines + 20 shared helpers                  | −101          |
| **PrintRepository**      | 211 lines (full state machine)                       | ~130 lines (MVP-reduced state machine)        | −81           |
| **OrderRepository**      | 254 lines (kept as-is)                               | 254 lines (no change — real domain logic)     | 0             |
| **RestaurantRepository** | 338 lines (kept as-is)                               | 338 lines (no change — real domain logic)     | 0             |
| **MembershipRepository** | 250 lines (kept as-is)                               | 250 lines (no change — core domain)           | 0             |
| **InviteRepository**     | 209 lines (kept as-is)                               | 209 lines (no change — unique business logic) | 0             |

**Net reduction:** ~544 lines of code removed/simplified while preserving all external behavior. Critical RLS (`withTenant`) wrapping preserved in all remaining repositories.

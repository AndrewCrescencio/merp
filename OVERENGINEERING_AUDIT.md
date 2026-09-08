# Over-Engineering Audit Report

**Repository:** merp
**Date:** 2026-09-08
**Scope:** Full repository scan (excluding node_modules, .git, build, .output)

---

## Executive Summary

| Finding                                               | Tag    | Est. Lines Removable | Dependencies Removable |
| ----------------------------------------------------- | ------ | -------------------- | ---------------------- |
| Repository interfaces with single implementations     | yagni  | ~60                  | 0                      |
| Custom timeout implementation vs stdlib               | stdlib | ~30                  | 0                      |
| Duplicate CSRF exemption logic in two middlewares     | shrink | ~18                  | 0                      |
| Three nearly-identical purge tasks                    | shrink | ~80                  | 0                      |
| Over-engineered ID generation with rejection sampling | yagni  | ~15                  | 0                      |
| **Total**                                             |        | **~203**             | **0**                  |

**Verdict:** Core auth logic (rate limiting, lockout, RLS integration, Better Auth config) is well-scoped to security requirements — not over-engineered. The findings above are mechanical duplication and speculative abstractions.

---

## Detailed Findings

### 1. Repository Interfaces with Single Implementations (yagni)

**Files:**

- `server/utils/auth/identity/repository.ts:91` — `IIdentityRepository`
- `server/utils/auth/company/repository.ts:43` — `ICompanyRepository`
- `server/utils/auth/invite/repository.ts:34` — `IInviteRepository`

**What to cut:** Three TypeScript interfaces (`IIdentityRepository`, `ICompanyRepository`, `IInviteRepository`) each implemented by exactly one class (`IdentityRepository`, `CompanyRepository`, `InviteRepository`). The interfaces declare ~20 methods each but are never used polymorphically — no dependency injection, no mock implementations in tests, no multiple implementations.

**Replacement:** Delete the interfaces. Export the concrete classes directly. If future polymorphism is needed, add the interface then (YAGNI).

**Lines affected:** ~60 lines of interface boilerplate + export statements.

**Evidence:**

```bash
grep -rn "IIdentityRepository\|ICompanyRepository\|IInviteRepository" --include="*.ts" server/
# Only shows: interface declaration, class implements, single export
```

---

### 2. Custom Timeout Implementation vs Stdlib (stdlib)

**Files:**

- `server/utils/shared/errors.ts:112-131` — `TimeoutError` class + `withTimeout` function
- `server/utils/auth/identity/repository.ts:14` — imports and uses `withTimeout`/`TimeoutError`

**What to cut:** Custom `withTimeout<T>(promise, ms)` + `TimeoutError` class (~30 lines). Node.js 22+ (current LTS) provides `Promise.withResolvers()` which enables a stdlib-only pattern:

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const { promise: timeoutPromise, resolve, reject } = Promise.withResolvers<never>()
  const id = setTimeout(() => reject(new Error('timeout')), ms)
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(id))
}
```

Or use `AbortController` with fetch-style APIs.

**Replacement:** Inline the 3-line stdlib pattern at call sites, or create a one-liner utility. Drop `TimeoutError` class — use plain `Error` with `name: 'TimeoutError'`.

**Lines affected:** ~30 lines in `errors.ts` + ~7 call sites in `identity/repository.ts`.

**Note:** Project uses `@types/node: ^25.9.3` (Node 22+ APIs available).

---

### 3. Duplicate CSRF Exemption Logic (shrink)

**Files:**

- `server/middleware/01-csrf-token.ts:6-27`
- `server/middleware/02-csrf-validate.ts:7-28`

**What to cut:** Identical `csrfExemptPaths` Set, `csrfExemptPrefixes` array, and `isCsrfExempt()` function duplicated across two middleware files (18 lines × 2 = 36 lines total).

**Replacement:** Extract to `server/utils/shared/csrf-exempt.ts`:

```typescript
export const csrfExemptPaths = new Set([...])
export const csrfExemptPrefixes = ['/api/auth/reset-password/']
export function isCsrfExempt(path: string): boolean { ... }
```

Import in both middlewares.

**Lines affected:** ~36 → ~18 (shared) + 2 imports = net -16 lines.

---

### 4. Three Nearly-Identical Purge Tasks (shrink)

**Files:**

- `server/tasks/purge-sessions.ts` (40 lines)
- `server/tasks/purge-auth-events.ts` (40 lines)
- `server/tasks/purge-security-state.ts` (42 lines)

**What to cut:** Three Nitro tasks with 95% identical structure:

- Same `defineTask` wrapper
- Same logging pattern (`purge_start`, `purge_complete`, `purge_error`)
- Same try/catch/return pattern
- Only differences: table, cutoff calculation, log event names

**Replacement:** Single parameterized task factory:

```typescript
function createPurgeTask(name, description, table, dateColumn, retentionMs, eventName) {
  return defineTask({
    meta: { name, description },
    async run() {
      const cutoff = new Date(Date.now() - retentionMs)
      logger.info(`${eventName}_start`, { cutoff: cutoff.toISOString() })
      try {
        const result = await db.delete(table).where(lt(dateColumn, cutoff))
        logger.info(`${eventName}_complete`, {
          deletedCount: result.count ?? 0,
          cutoff: cutoff.toISOString(),
        })
        return { result: 'success', deletedCount: result.count ?? 0 }
      } catch (error) {
        logger.error(`${eventName}_error`, { error: String(error) })
        return { result: 'error', error: String(error) }
      }
    },
  })
}

export default createPurgeTask(
  'purge-sessions',
  '...',
  session,
  session.expiresAt,
  24 * 60 * 60 * 1000,
  'session_purge',
)
export default createPurgeTask(
  'purge-auth-events',
  '...',
  authEvent,
  authEvent.createdAt,
  90 * 24 * 60 * 60 * 1000,
  'auth_event_purge',
)
export default createPurgeTask(
  'purge-security-state',
  '...',
  authSecurityState,
  authSecurityState.updatedAt,
  24 * 60 * 60 * 1000,
  'security_state_purge',
)
```

**Lines affected:** 122 → ~45 = net -77 lines.

---

### 5. Over-Engineered ID Generation (yagni)

**File:** `server/utils/auth/identity/repository.ts:39-50`

**What to cut:** `generateUserId()` uses rejection sampling to avoid modulo bias for 32-char alphanumeric IDs:

```typescript
const USER_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const maxValid = 256 - (256 % alphabetLength) // 256 - 4 = 252
while (chars.length < 32) {
  for (const byte of randomBytes(32)) {
    if (byte < maxValid) chars.push(USER_ID_ALPHABET[byte % alphabetLength])
  }
}
```

**Replacement:** Use native `crypto.randomUUID()` (Node 14.17+, universally available) or `randomBytes(16).toString('hex')` (32 hex chars, 128 bits entropy). The modulo bias on 62^32 space is astronomically negligible (~2^-128).

**Why it's over-engineering:**

- Better Auth already generates its own UUIDs for users
- This function is only used as fallback in `register.post.ts:110` when `user?.id` is missing (synthetic user from anti-enumeration path)
- The synthetic user ID is never persisted — it's only in the 201 response body
- `randomUUID()` is one line, cryptographically secure, zero bias

**Lines affected:** ~15 lines → 1 line.

**Usage trace:**

```bash
grep -rn "generateUserId" --include="*.ts" server/
# server/api/auth/register.post.ts:2,110
# server/utils/auth/identity/repository.ts:39
# test file mocks it
```

---

## What Is NOT Over-Engineered (Verified)

The following were examined and found to be appropriately scoped to security/functional requirements:

| Component                                                      | Reason                                    |
| -------------------------------------------------------------- | ----------------------------------------- |
| Rate limiting (sliding window, per-email/IP/user)              | FR-010, AUD-02, AUD-16 requirements       |
| Dual-tier lockout (pair + global)                              | AUD-02: prevents distributed brute-force  |
| Trusted proxy CIDR validation                                  | AUD-05: prevents IP spoofing              |
| PII audit logging (no names in logs)                           | AUD-14: GDPR/LGPD compliance              |
| RLS-backed tenant context (`withTenant`)                       | AUD-20: row-level security enforcement    |
| Email queue with retry/backoff                                 | Reliability requirement                   |
| CSRF double-submit with HMAC                                   | Standard OWASP mitigation                 |
| Better Auth configuration (2FA, session TTL, cookie hardening) | Security baseline                         |
| Timing-safe password verification (AUD-03, AUD-07)             | Anti-enumeration hardening                |
| Input length limits (email/password/name)                      | AUD-14: prevents DoS via oversized inputs |
| HIBP password breach check                                     | NIST 800-63B compliance                   |

---

## Recommendation Priority

1. **Immediate (trivial, zero risk):** Findings 3, 4, 5 — mechanical deduplication
2. **Low effort (one file):** Finding 2 — replace with stdlib pattern
3. **Requires care (test coverage):** Finding 1 — remove interfaces, verify no test mocks depend on them

**Total effort estimate:** < 30 minutes for all five changes.

---

## Appendix: File Line Counts (for context)

```
server/utils/auth/identity/repository.ts     604 lines
server/utils/auth/company/repository.ts      473 lines
server/utils/auth/invite/repository.ts       200 lines
server/utils/shared/errors.ts                131 lines
server/utils/shared/security.ts              300 lines
server/utils/shared/csrf.ts                  70 lines
server/utils/shared/email.ts                 162 lines
server/utils/shared/ip.ts                    56 lines
server/utils/auth/tenant-context.ts          27 lines
server/middleware/01-csrf-token.ts           31 lines
server/middleware/02-csrf-validate.ts        34 lines
server/middleware/00-no-store.ts             15 lines
server/middleware/pii-audit.ts               28 lines
server/middleware/auth.ts                    133 lines
server/tasks/purge-sessions.ts               40 lines
server/tasks/purge-auth-events.ts            40 lines
server/tasks/purge-security-state.ts         42 lines
server/tasks/process-email-queue.ts          31 lines
```

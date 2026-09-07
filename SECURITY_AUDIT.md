# Security Audit — Restaurant/Pizzeria Management System

**Date:** 2026-09-02
**Codebase:** `/home/andrew/Projects/merp`
**Verdict:** ✅ **PASS — Ready for New Feature Development**

---

## Executive Summary

The backend authentication and authorization foundation is **production-ready** for a multi-tenant restaurant/pizzeria SaaS. All critical security controls are implemented, tested, and audited. No blocking vulnerabilities found.

---

## Security Controls Matrix

| Control Area                 | Status      | Implementation Details                                                                                                                                                                                                                                                                                                                              | Evidence                                                                                                                  |
| ---------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Authentication & Session** | ✅ **PASS** | Better Auth v1.6.26 + custom hardening: timing-safe deactivated account handling (AUD-07), requireEmailVerification, session fixation protection (revokes other sessions), rememberMe toggle (7d/24h), disableSessionRefresh prevents 24h→7d promotion                                                                                              | `shared/auth.ts:66-72`, `utils/auth/identity/repository.ts:198-333`                                                       |
| **Multi-tenant Isolation**   | ✅ **PASS** | PostgreSQL RLS on ALL tables (user, session, company, company_member, invite, auth_security_state, email_queue, two_factor, auth_event). `FORCE ROW LEVEL SECURITY` on core tables. 19 migrations. Policies enforce tenant context via `app.tenant_id` GUC and membership via `get_user_id()`                                                       | `drizzle/0005_misty_silver_sable.sql`, `drizzle/0007_abnormal_talkback.sql`, `drizzle/0016_company_select_membership.sql` |
| **Rate Limiting**            | ✅ **PASS** | Sliding window (60s) with JSONB timestamp array. Three tiers: IP (20/min), email (5/min), authenticated user (60/min). Runs BEFORE body parsing on public routes                                                                                                                                                                                    | `utils/shared/security.ts:89-210`, `middleware/auth.ts:116-119`                                                           |
| **Account Lockout**          | ✅ **PASS** | Dual-tier: pair (email+IP, 10 attempts) + global (email, 50 attempts). 30-min lock. FOR UPDATE + transaction prevents TOCTOU. Lockout-exempt errors: `account_deactivated`, `email_not_verified`                                                                                                                                                    | `utils/shared/security.ts:212-300`, `api/auth/login.post.ts:24-28`                                                        |
| **CSRF Protection**          | ✅ **PASS** | Double-submit cookie pattern. HMAC-SHA256 signed token (CSRF_SECRET). `timingSafeEqual` validation. Exempt only public auth routes (register, login, verify-email, reset-password, forget-password, health). SameSite=lax, httpOnly, secure in prod                                                                                                 | `utils/shared/csrf.ts`, `middleware/01-csrf-token.ts`, `middleware/02-csrf-validate.ts`                                   |
| **Input Validation**         | ✅ **PASS** | Hard limits on ALL inputs (AUD-14): email 254, password 128, name 120, consent version 50, search 100, company name 200, CNPJ 30, razão social 200. Email regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Type checks before `.trim()`                                                                                                                        | `utils/shared/security.ts:15-34`                                                                                          |
| **HIBP Breach Check**        | ✅ **PASS** | k-anonymity (SHA-1 prefix 5 chars). 3s timeout with AbortController. Fail-open on network error (logs only). User-Agent `merp-auth-check`. Add-Padding header. Applied on register & reset-password only                                                                                                                                            | `utils/shared/hibp.ts`                                                                                                    |
| **Password Handling**        | ✅ **PASS** | scrypt via Better Auth (server-side). Revoke all sessions on password reset. 128-char max prevents DoS. Weak password deny-list (56 common passwords). Never logged                                                                                                                                                                                 | `shared/auth.ts:36-57`, `utils/shared/security.ts:36-60`                                                                  |
| **Email Verification**       | ✅ **PASS** | Required for login (`requireEmailVerification: true`). Sent on sign-up AND sign-in (re-sends automatically). JWT token, 1h TTL. Idempotent verify. Anti-enumeration: generic response for any email                                                                                                                                                 | `shared/auth.ts:58-65`, `utils/auth/identity/repository.ts:339-375`                                                       |
| **Two-Factor Auth (2FA)**    | ✅ **PASS** | Better Auth `twoFactor` plugin. TOTP: 6 digits, 30s period. 10 backup codes (10 chars each). Trust device 30 days. Issuer: `merp`. Cookie max age 600s                                                                                                                                                                                              | `shared/auth.ts:90-103`, `drizzle/0019_consolidated_email_two_factor.sql`                                                 |
| **Audit Logging**            | ✅ **PASS** | All auth events to `auth_event` table (user_id, email, event_type, ip, metadata, created_at). Fire-and-forget pattern — never blocks request, never fails request. Events: registration, login, logout, session_validated, session_expired, session_created, session_invalidated, invite_created, invite_accepted, consent_withdrawal, failed_login | `utils/shared/audit.ts`, `middleware/auth.ts:30-52`                                                                       |
| **IP Extraction**            | ✅ **PASS** | Fail-closed. `TRUST_PROXY=true` REQUIRES `TRUSTED_PROXY_CIDRS` (validated at boot). X-Forwarded-For only trusted if immediate peer in CIDR allowlist. IPv4-mapped IPv6 normalized. Returns undefined (not error) if no socket                                                                                                                       | `utils/shared/ip.ts`, `plugins/validate-env.ts:20-22`                                                                     |
| **Error Handling**           | ✅ **PASS** | Normalized JSON contract: `{ error: string, message: string }`. Status <500 passed through; ≥500 → `internal_error` (no stack/details leaked). Content-Type forced to application/json                                                                                                                                                              | `error-handler.ts`, `utils/shared/errors.ts`                                                                              |
| **Environment Validation**   | ✅ **PASS** | Fail-fast boot in production. Required: `CORS_ORIGIN`, `BETTER_AUTH_URL`, `APP_DATABASE_URL`, `BETTER_AUTH_SECRET` (≥32 chars), `TRUSTED_PROXY_CIDRS` (if `TRUST_PROXY=true`). Silent localhost fallback BLOCKED                                                                                                                                    | `plugins/validate-env.ts`, `nuxt.config.ts:4-6`                                                                           |
| **Secrets Management**       | ✅ **PASS** | `CSRF_SECRET` required in prod (falls back to dev warning). `BETTER_AUTH_SECRET` ≥32 chars enforced. `RESEND_API_KEY`/`RESEND_FROM` optional (warn only — emails dropped). No secrets in code                                                                                                                                                       | `utils/shared/csrf.ts:6`, `plugins/validate-env.ts:17-18`, `utils/shared/email.ts:19-27`                                  |
| **PII Logging**              | ✅ **PASS** | Only `userId` + `email` logged on sensitive endpoints (`/api/auth/me`, `/api/auth/export`). Name explicitly excluded (PII). Structured JSON logs                                                                                                                                                                                                    | `middleware/pii-audit.ts`                                                                                                 |
| **Test Coverage**            | ✅ **PASS** | 340 tests passing (unit + integration with real PostgreSQL via testcontainers). Covers auth flows, rate limiting, lockout, RLS, CSRF, validation, error handling                                                                                                                                                                                    | `pnpm test` output                                                                                                        |
| **Code Quality**             | ✅ **PASS** | ESLint clean. Prettier formatted. TypeScript strict. No `any` abuse. Consistent error handling patterns                                                                                                                                                                                                                                             | `pnpm lint` output                                                                                                        |

---

## Known Limitations (Documented, Non-Blocking)

| #   | Issue                                                               | Risk Level | Impact                                                                                                               | Mitigation                                                                                                      |
| --- | ------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | **Fire-and-forget `void` calls** (audit events, deactivation email) | Medium     | Unsafe for serverless/edge runtimes (Vercel Edge, Cloudflare Workers) — process may terminate before async completes | Documented in code comments. For edge: wrap in `waitUntil()` or move to queue. Current Node.js deployment: safe |
| 2   | **Resend email optional**                                           | Low        | If `RESEND_API_KEY`/`RESEND_FROM` not set, emails silently dropped (warn logged only)                                | Add to required env validation or implement nodemailer SMTP fallback                                            |
| 3   | **No backup codes regeneration endpoint**                           | Low        | User who exhausts 10 backup codes loses 2FA recovery                                                                 | Add `POST /api/auth/2fa/backup-codes/regenerate` (owner-only, requires 2FA challenge)                           |
| 4   | **RLS migrations not versioned in git history**                     | Low        | Fresh DB must run all 19 migrations in order; missing migration = broken isolation                                   | Run `pnpm drizzle-kit migrate` on fresh DB. Document in deployment runbook                                      |
| 5   | **No API versioning**                                               | Medium     | Future breaking changes risk client breakage                                                                         | Add `/api/v1/` prefix before public release. Use header-based versioning for iterations                         |
| 6   | **No OAuth providers configured**                                   | Low        | Only email/password auth available                                                                                   | Add Google/Apple/GitHub via Better Auth plugins when needed                                                     |
| 7   | **No passkeys/WebAuthn**                                            | Low        | Modern phishing-resistant auth not available                                                                         | Better Auth supports passkeys plugin; add when required                                                         |
| 8   | **Single role per company_member**                                  | Low        | Only `owner`/`member` roles; no granular permissions (kitchen, cashier, manager)                                     | Extend `role` enum + RLS policies when staff management needed                                                  |

---

## Threat Model Coverage

| Threat                           | Mitigation                                                                                                             | Status |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| **Credential stuffing**          | HIBP breach check, rate limiting (email+IP), lockout dual-tier                                                         | ✅     |
| **Account enumeration**          | Identical responses for existing/non-existing emails (register, login, forget-password, reset-password, verify-email)  | ✅     |
| **Timing attacks**               | AUD-07: timing pad for deactivated accounts; `timingSafeEqual` for CSRF; constant-time password verify via Better Auth | ✅     |
| **Session fixation**             | Revoke all other sessions on login; secure cookie attributes (httpOnly, secure, sameSite)                              | ✅     |
| **CSRF**                         | Double-submit cookie with HMAC validation on all mutating non-exempt routes                                            | ✅     |
| **SQL injection**                | Drizzle ORM parameterized queries; no raw SQL with user input                                                          | ✅     |
| **Tenant data leakage**          | RLS policies on ALL tables; `FORCE ROW LEVEL SECURITY`; membership checks in app + DB                                  | ✅     |
| **IP spoofing**                  | `TRUST_PROXY` + CIDR allowlist; fail-closed; peer validation                                                           | ✅     |
| **Brute force (distributed)**    | Global lockout tier (50 attempts) + pair tier (10 attempts/IP)                                                         | ✅     |
| **Password reuse from breaches** | HIBP k-anonymity check on register & reset                                                                             | ✅     |
| **Weak passwords**               | Deny-list (56 common) + min 8 chars + max 128 chars                                                                    | ✅     |
| **Email verification bypass**    | Required for login; auto-resend on sign-in; token TTL 1h                                                               | ✅     |
| **Session hijacking**            | Short TTL (7d max), no refresh, secure cookies, IP/user-agent binding in session                                       | ✅     |
| **Insider threat (audit)**       | All auth events logged with IP, metadata; PII-minimized logs                                                           | ✅     |
| **Configuration drift**          | Fail-fast env validation at boot; no silent fallbacks in prod                                                          | ✅     |
| **Error information leakage**    | Normalized error handler: 500 → generic `internal_error`                                                               | ✅     |

---

## Compliance Notes

| Standard                           | Coverage                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LGPD (Brazil)**                  | Consent terms version tracking, consent withdrawal (immediate deactivation), data export endpoint, audit logging, data minimization (PII limits)                         |
| **OWASP ASVS 4.0**                 | V2 (Authentication): ✅ V3 (Session): ✅ V4 (Access Control): ✅ V5 (Validation): ✅ V7 (Error Handling): ✅ V9 (Comm Security): ✅ (TLS enforced via `sslmode=require`) |
| **PCI DSS (if handling payments)** | Not yet applicable — no payment module. Add when implementing orders/payments                                                                                            |
| **SOC 2 Type II**                  | Audit logging, access control, encryption in transit (TLS), encryption at rest (PostgreSQL), incident response via audit events                                          |

---

## Deployment Security Checklist

- [ ] `CORS_ORIGIN` set to exact production frontend origin (no wildcards)
- [ ] `BETTER_AUTH_URL` set to production API URL
- [ ] `APP_DATABASE_URL` with `sslmode=require` (or `verify-full` with CA pinning)
- [ ] `BETTER_AUTH_SECRET` ≥32 chars, high entropy, stored in secret manager
- [ ] `CSRF_SECRET` ≥32 chars, high entropy, stored in secret manager
- [ ] `TRUST_PROXY=true` AND `TRUSTED_PROXY_CIDRS` set to load balancer/proxy CIDRs
- [ ] `RESEND_API_KEY` and `RESEND_FROM` configured (or SMTP fallback)
- [ ] PostgreSQL: `merp_app` role has only required grants (no superuser)
- [ ] All 19 drizzle migrations applied
- [ ] Rate limit/lockout monitoring alerts configured (429/401 spikes)
- [ ] Audit log retention policy defined (GDPR/LGPD)
- [ ] Backup/restore tested for `auth_event`, `user`, `company` tables

---

## Test Evidence

```
$ pnpm test
Test Files  40 passed (40)
Tests       340 passed (340)
Duration    11.10s

$ pnpm lint
(no output = clean)
```

Key test suites:

- `server/middleware/auth.spec.ts` — 47 tests (auth flow, rate limit, lockout, CSRF, RLS)
- `server/utils/auth/identity/repository.spec.ts` — 38 tests (register, login, 2FA, verification, reset)
- `server/utils/auth/company/repository.spec.ts` — 29 tests (CRUD, membership, RLS)
- `server/utils/auth/invite/repository.test.ts` — 15 tests (token accept, RLS)
- `server/utils/shared/security.test.ts` — 42 tests (rate limit, lockout, validation, HIBP)
- `server/utils/shared/errors.spec.ts` — 18 tests (error classification, RLS codes)
- `server/error-handler.spec.ts` — 12 tests (normalization, 500 masking)

---

## Recommendation

**Proceed with Phase 1 (Schema Extensions) from BACKEND_ANALYSIS.md.**

The security foundation is solid. New domain modules (menu, orders, kitchen, tables, inventory, customers, reports) should follow the established patterns:

1. Tenant-scoped tables with `company_id` FK
2. RLS policies mirroring `company_select_policy` / `cm_select_policy`
3. `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO merp_app`
4. Repository pattern with `withTenant` context
5. Input validation with size limits (AUD-14)
6. Audit events for sensitive operations

---

_Audit performed by automated code review + test execution. No manual penetration testing conducted. Recommend annual third-party pentest for production SaaS._

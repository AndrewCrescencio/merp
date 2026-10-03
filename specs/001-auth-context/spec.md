# Feature Specification: Auth Bounded Context

**Feature Branch**: `001-auth-context`

**Created**: 2026-06-11

**Status**: Draft

**Input**: User description: "Build the Auth bounded context for Merp."

## Overview

The Auth bounded context handles user identity — registration, login,
logout, and session management. It is a supporting domain that every
other context depends on for authenticated access and multi-tenant
company membership.

**Why this exists**: An ERP manages sensitive fiscal and financial data.
Without authentication, there is no way to know who is accessing the
system, which tenant they belong to, or whether they are authorized.
Auth is the gate — every interaction flows through it.

## Clarifications

### Session 2026-06-11

- Q: What are the session expiry TTL values? → A: Fixed 7d TTL from
  creation (`expiresIn: 7d`, `disableSessionRefresh: true` — no sliding
  refresh). `rememberMe: true` persists the cookie for 7d; without it the
  cookie is session-scoped. The DB row always expires 7d after creation.
- Q: How are companies created and users assigned to them? → A:
  Self-service: after registration, the user can create a new company
  (becoming its first member) or search for an existing company to join.
- Q: Should auth operations be logged for audit purposes? → A: Yes —
  all auth events (login, failed attempt, registration, logout) are
  logged.
- Q: What is the account lockout policy? → A: Lock after 10 total
  failed attempts (any time window), auto-unlock after 30 minutes.
- Q: What is the user lifecycle — can users be deactivated or deleted?
  → A: Soft delete: users are flagged as inactive, never hard-deleted.
- Q: When a session expires mid-request (e.g., during a multi-step
  operation like fiscal note emission), what should the system do?
  → A: Return HTTP 401 with
  `{ "error": "session_expired", "message": "Session expired. Please login again." }`
  and include a `session_expired` error code.
- Q: Should rate-limit responses include a `RateLimit-Remaining` header?
  → A: Yes, include `RateLimit-Remaining` in addition to `Retry-After`
  and `RateLimit-Reset`.
- Q: What timeouts should be configured for external calls? → A: 5s
  timeout for Better Auth / session operations, 10s timeout for OAuth
  provider HTTP calls.
- Q: What should happen when shared/auth.ts initialization fails at
  startup? → A: Return HTTP 503 from auth endpoints and health check,
  log the error, keep the process alive (graceful degradation).
- Q: Should registration have explicit idempotency key support to
  prevent duplicate accounts on network retry? → A: No — email
  uniqueness (FR-003) already prevents duplicates. Same-email retries
  return the same generic `201 Created` as a new registration
  (anti-enumeration, AUD-03) — never `409 Conflict`.
- Q: What should happen when an unexpected 500 error occurs in an
  auth endpoint? → A: Return 500 with
  `{ "error": "internal_error", "message": "An unexpected error occurred." }`,
  log full details server-side, never leak stack traces.
- Q: What CORS configuration should auth endpoints use? → A: Allow
  specific production origin (e.g., `https://app.merp.com.br`) with
  credentials (`Access-Control-Allow-Credentials: true`). No wildcard
  origins — cookies require explicit origin.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Email & Password Registration and Login (Priority: P1)

A new user registers with email and password, then logs in with those
credentials. After login, the system maintains an active session across
requests.

**Why this priority**: Email/password auth is the baseline for any
multi-tenant system. Every feature — fiscal note emission, financial
operations, tenant management — requires an authenticated user.
Without this story, nothing else works.

**Independent Test**: Register with email+password, then login with the
same credentials, then access a protected resource successfully.

**Acceptance Scenarios**:

1. **Given** a new email and password, **When** the user registers,
   **Then** the system creates an account and returns a success response.
2. **Given** an existing account, **When** the user logs in with correct
   credentials, **Then** the system starts an authenticated session.
3. **Given** an existing account, **When** the user logs in with an
   incorrect password, **Then** the system denies access with an error.
4. **Given** an email already registered, **When** another user tries to register
   with the same email, **Then** the system responds 201 Created with body
   identical to a new registration (AUD-03, anti-enumeration) and does not
   create a duplicate (FR-003 = uniqueness in DB, not error code). Never 409.

---

### User Story 2 - Logout and Session Lifecycle (Priority: P2)

An authenticated user can end their session explicitly. Sessions expire
automatically after a period of inactivity.

**Why this priority**: Users must be able to securely end access to the
system. Sessions that never expire are a security risk in a fiscal
environment. P2 because login (P1) must exist first to have something
to log out from.

**Independent Test**: Login, receive a session, logout, then attempt an
authenticated request and receive an access-denied error.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the user logs out,
   **Then** the session is terminated.
2. **Given** no active session, **When** the user accesses a protected
   resource, **Then** the system denies access.
3. **Given** an active session past its 7d TTL, **When** the user
   makes a request, **Then** the system denies access.

---

### User Story 3 - Multi-Tenant Membership (Priority: P3)

After registration, the user can create a new company (becoming its
first member) or **join exclusively via invite**. Once a member of at
least one company, the user operates within that tenant context.

**Why this priority**: Merp serves multiple companies. User identity
without tenant context is incomplete — we need to know _which company_
the user is acting on behalf of. P3 because tenant membership builds on
top of basic auth (P1) and session management (P2).

**Independent Test**: Register, create a company, login, then verify
authenticated requests carry the correct tenant context.

**Acceptance Scenarios**:

1. **Given** a registered user with no company, **When** the user
   creates a new company, **Then** they become its first member.
2. **Given** a registered user, **When** they accept a valid invite
   token for a company, **Then** they become a member.
3. **Given** a user with one company, **When** the user logs in,
   **Then** the system defaults to their company context.
4. **Given** a user member of multiple companies, **When** the user
   logs in, **Then** they can switch between companies.
5. **Given** a user not assigned to any company, **When** they log in,
   **Then** the system returns a success but limited-access status.

---

### Edge Cases

- What happens when a user registers with an already-used email?
- What happens when the session expires mid-operation (e.g., during
  fiscal note emission)? → The system returns HTTP 401 with
  `{ "error": "session_expired", "message": "Session expired. Please login again." }`.
  The client retries after re-authentication. A `session_expired`
  observability event is emitted per FR-023.
- How does the system handle concurrent sessions from different devices? → Allowed per FR-012. No limit enforced.
- What happens when the identity store is unreachable during login? → The system returns HTTP 503 with `{ "error": "service_unavailable", "message": "Temporary error. Please try again." }` per FR-028.
- What happens when repeated failed login attempts occur? → Login attempts from a given IP are locked for 30 min after 10 failed attempts per FR-016; after 50 total failed attempts across IPs the account is locked for everyone for 30 min (AUD-02).
- How does the system behave under high registration volume? → Register requests are rate-limited per FR-010.
- What happens when a deactivated user tries to log in? → Login denied with HTTP 401 per FR-017.
- What happens to a user's sessions when their account is deactivated? → All sessions immediately invalidated per FR-017.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST allow user registration with email and password.
- **FR-002**: System MUST validate email format and enforce a minimum
  password length during registration.
- **FR-003**: System MUST reject registration with a duplicate email.
- **FR-004**: System MUST allow login with email and password.
- **FR-005**: System MUST maintain an authenticated session after
  successful login, valid across subsequent requests.
- **FR-006**: System MUST allow logout by terminating the current session.
- **FR-007**: System MUST reject unauthenticated requests to protected
  resources.
- **FR-008**: System MUST protect stored passwords against compromise
  (e.g., hashing).
- **FR-009**: Sessions MUST expire 7d after creation (fixed TTL:
  `expiresIn: 7d` with `disableSessionRefresh: true` — no sliding refresh).
  The `rememberMe` flag controls cookie persistence only (7d persistent vs
  session-scoped cookie); the server-side row always expires 7d after creation.
  **Regra operacional atual (PDV/KDS compartilhado)**: TTL 7d + logout
  obrigatório ao fim do turno. Evolução planejada em ADR-004 (TTL por perfil
  - PIN de turno).
- **FR-010**: Login attempts MUST be rate-limited to mitigate brute-force
  attacks. Rate limiting uses a **sliding window** of 5 requests per 1 minute per
  email address. When the limit is exceeded, the server
  responds with HTTP 429 Too Many Requests. The response body MUST follow
  the standard error format:
  `{ "error": "rate_limit_exceeded", "message": "Too many requests. Try again later.", "retryAfter": <seconds> }`.
  Response headers MUST include `Retry-After` (seconds until reset),
  `RateLimit-Reset` (Unix timestamp of window expiry), and
  `RateLimit-Remaining` (remaining requests in current window).
- **FR-011**: System MUST associate each authenticated user with at least
  one company (tenant) for authorization decisions.
- **FR-013**: Registration MUST create an account only. Company setup
  is a separate step after registration.
- **FR-014**: System MUST provide an endpoint to create a new company,
  making the requesting user its first member.
- **FR-015**: System MUST provide an endpoint to accept an invite
  token and join a company (join exclusivamente via convite).
- **FR-016**: System MUST lock login attempts after 10 failed attempts
  from the same IP for an email (any time window); locked (email, IP) pairs
  auto-unlock after 30 minutes. Additionally, the system MUST lock the account
  for all IPs after 50 total failed attempts across IPs (distributed brute
  force with IP rotation, AUD-02), also auto-unlocking after 30 minutes.
- **FR-017**: System MUST support deactivating a user (soft delete).
  Deactivated users cannot log in, but their data is preserved.
- **FR-018**: System MUST log all auth events — registration, login,
  failed login, and logout — with timestamp, email, and outcome.
- **FR-012**: System MUST support multiple active sessions per user
  (different devices/browsers).
- **FR-019**: System MUST support company deletion. Only company owners
  can delete (no platform `super_admin` role exists — deferred). Deletion is a soft-delete (`is_deleted`
  flag) to preserve referential integrity for fiscal records. Cascade
  behavior: all CompanyMember rows purged, all pending invites purged,
  company no longer selectable as tenant context. Active sessions for
  the user's other tenants remain valid.
- **FR-020**: System MUST provide a data export endpoint returning all
  user personal data (profile, memberships, sessions, auth events) in JSON
  format, fulfilling LGPD data portability rights (Art. 18). Only events
  linked to the requesting user are included.
- **FR-021**: System MUST record user consent at registration
  (acceptance of terms and data processing) with timestamp and version.
  Consent withdrawal MUST trigger immediate account deactivation and
  session termination. An automated PII deletion/anonymization queue is
  deferred (out of scope) — withdrawal is recorded as a
  `consent_withdrawal` audit event.
- **FR-022**: System MUST log all access to PII data (email, name) in
  the audit log — who accessed it, when, and for what purpose. PII
  access logs are retained for 5 years.
- **FR-023**: System MUST emit structured observability events for
  session lifecycle: session_created, session_validated,
  session_expired, session_invalidated. Each event includes session_id,
  user_id, tenant_id (if applicable), and timestamp.
- **FR-024**: System MUST enforce HTTP timeouts for all outbound calls:
  5s for Better Auth library calls, 10s for OAuth provider calls.
  Timeout failures MUST return HTTP 503 with
  `{ "error": "upstream_timeout", "message": "External service timed out. Try again." }`
  and MUST be logged with full error details.
- **FR-025**: If `shared/auth.ts` initialization fails at startup
  (e.g., missing env vars, Better Auth config error), the system MUST
  NOT crash. Instead, auth endpoints and health check MUST return
  HTTP 503 with
  `{ "error": "auth_unavailable", "message": "Authentication service unavailable." }`.
  The initialization error MUST be logged with full details.
- **FR-026**: All unexpected 500-level errors MUST return a consistent
  response body:
  `{ "error": "internal_error", "message": "An unexpected error occurred." }`.
  Stack traces, internal paths, and implementation details MUST NOT be
  leaked in the response. The full error MUST be logged server-side
  with correlation ID for debugging.
- **FR-027**: CORS MUST be configured with explicit allowed origins
  (no wildcard). Auth endpoints MUST include
  `Access-Control-Allow-Credentials: true` for session cookie support.
  Preflight (`OPTIONS`) requests MUST respond with appropriate CORS
  headers for the configured origins.
- **FR-028**: Request body validation MUST use **Zod** schemas named per
  endpoint (ex.: `createOrderSchema`, `loginSchema`). Validation errors
  return 400 with `details` per field (consistent with
  `specs/000-foundation/endpoint-pattern.md`).
- **FR-028**: If the database is unreachable during any auth operation,
  the system MUST return HTTP 503 with
  `{ "error": "service_unavailable", "message": "Temporary error. Please try again." }`.
  The underlying database error MUST NOT be leaked. The event MUST be
  logged with full error details.
- **FR-029**: System MUST verify email ownership at registration and
  block login until verification (AUD-04). Registration MUST send a
  verification link; login with correct credentials on an unverified
  account MUST return 403 `email_not_verified` (reachable only with the
  correct password — never leaks account existence). Verification links
  expire after 1h; replay is idempotent. The system MUST provide a
  resend endpoint (`send-verification-email`) whose response is
  indistinguishable for unknown/already-verified accounts.
- **FR-030**: System MUST provide a password recovery flow ("forgot
  password") (AUD-04): `forget-password` sends a single-use reset link
  (expires 1h) to the account owner's email and always answers
  `{ "status": true }` (anti-enumeration); `reset-password` consumes the
  token (replay MUST fail with 400) and revokes ALL sessions on
  success. Recovery MUST work for any account with a password —
  including accounts pre-registered by a third party — so the real
  email owner can always take the account back.

### Key Entities

- **User**: A person who can access the system. Has an email, can
  authenticate, and has an active/inactive state. Belongs to one or
  more companies.
- **Session**: Represents an authenticated user's active access period.
  Created on login, destroyed on logout or expiry.
- **Company**: A tenant in the multi-tenant model. Users are members of
  companies and operate within their scope.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Registration completes in under 2 seconds (p95).
- **SC-002**: Login completes in under 1 second (p95).
- **SC-003**: Session validation (authenticated request overhead) is
  under 100ms (p95).
- **SC-004**: Duplicate registration returns an error in under 500ms.
- **SC-005**: Unauthenticated requests return an access-denied response
  in under 50ms.
- **SC-006**: a 6ª requisição no window de 60s (por email) retorna 429 com
  header `Retry-After`. Limites completos em `specs/000-foundation/endpoint-pattern.md`.

## Assumptions

- Email delivery (verification, password reset, welcome emails) is out
  of scope for the MVP.
- User profile management (name, avatar, preferences) is out of scope
  for the MVP.
- Multi-tenancy scoping (which company a user belongs to) is managed
  at the auth layer — downstream contexts consume the tenant context
  from the authenticated request.
- OAuth / social login is deferred — email+password is sufficient for
  the initial launch.
- Role-based access control (admin, operator, viewer) is deferred —
  the MVP treats all authenticated users within a company as having
  equal access.
- The auth context does not handle fiscal rules, financial transactions,
  or any domain logic outside identity and access.

## Threat Model & Security Scope

**In scope for MVP**:

- Brute-force mitigation via rate limiting (sliding window, 5 req/min per
  email) and account lockout (10 failures, 30 min auto-unlock).
- Session token protection: httpOnly, Secure, SameSite=Lax cookies.
  Tokens never exposed in URLs, logs, or error messages.
- Credential protection: passwords hashed by Better Auth (bcrypt, cost
  factor 10+). Passwords never logged or returned in responses.
- Multi-tenancy isolation: RLS at database layer + withTenant at
  application layer. Defense in depth prevents cross-tenant data leaks.
- TLS enforcement assumed at reverse proxy layer (not part of this
  context's implementation).

**Out of scope for MVP**:

- OAuth / social login flows and their CSRF protections.
- Role-based access control (RBAC) — all authenticated members have equal
  access within a tenant.
- API key management and programmatic access tokens.
- Audit trail for non-auth events (data access, mutations) — deferred to
  each bounded context.
- Secrets rotation, certificate management, and infrastructure-level
  security hardening (WAF, DDoS protection).
- Penetration testing and formal security audit — deferred to pre-launch
  hardening phase.

**Monitoring & alerting thresholds**:

| Metric                    | Warning                  | Critical        | Alert                 |
| ------------------------- | ------------------------ | --------------- | --------------------- |
| Login failure rate        | >20% of attempts in 5min | >50% in 5min    | Ops email + dashboard |
| Rate-limit hits/min       | >100 hits/min            | >500 hits/min   | Ops email + SMS       |
| Registration rate         | >50/min                  | >200/min        | Ops email             |
| Session validation errors | >10% in 5min             | >30% in 5min    | Ops email             |
| PII access (anomalous)    | >2x normal rate          | >5x normal rate | Security team email   |

All thresholds are configurable via environment variables. Metrics are
exposed via a `/metrics` endpoint (Prometheus format) for dashboard
integration.

**Security review trigger**: A formal security review MUST be conducted
before any production deployment that serves real user data. The review
must cover: session management implementation, rate limiting correctness,
RLS policy validation, and error message leakage.

## Data Governance & Compliance

### PII Classification

The following fields contain Personally Identifiable Information (PII)
under Brazilian LGPD:

| Field           | Classification      | Sensitivity | Retention                                      |
| --------------- | ------------------- | ----------- | ---------------------------------------------- |
| email           | Direct identifier   | High        | Indefinite while active, 5y after deactivation |
| name            | Direct identifier   | Medium      | Same as email                                  |
| hashed_password | Auth secret         | High        | Same as email (irreversibly hashed)            |
| CNPJ            | Indirect identifier | Medium      | Indefinite (fiscal record)                     |
| razao_social    | Business data       | Low         | Indefinite (fiscal record)                     |
| IP address      | Behavioral          | Low         | 90 days (auth logs)                            |
| session_token   | Auth secret         | High        | 24h / 7d (session TTL)                         |

### Data Retention & Purging

- **Sessions**: Expired sessions (past TTL + 24h grace) purged daily.
  Remember-me sessions purged 48h after 7d TTL.
- **Auth logs**: Retained for 90 days, then aggregated (counts only)
  and purged.
- **Expired invites**: Purged 30 days after `expiresAt`.
- **Deactivated accounts**: Data retained for 5 years (fiscal compliance
  with Brazilian archival law), then permanently anonymized — email and
  name stripped, hashed_password destroyed, IP addresses in logs
  truncated to /24.
- **Hard-deletion on demand**: Upon verified user request, PII fields
  (email, name) are overwritten with `"[deleted]"` placeholders.
  Sessions and memberships are immediately removed. Auth logs and fiscal
  foreign-key references are preserved but disassociated from the
  deleted identity.

### Data Breach Notification

Per LGPD Art. 48:

1. **Detect**: Monitor auth failure rate anomalies (>500% above
   baseline) and unauthorized access attempts. Alert ops within 5
   minutes.
2. **Assess**: Determine scope (data categories, affected user count,
   records exposed) within 2 hours of detection.
3. **Notify ANPD**: Within 24h with breach description, affected data
   categories, user count, and containment measures.
4. **Notify affected users**: Within 48h via email with breach
   description, data involved, and recommended actions (password change,
   account monitoring).

### Cross-Border Data Transfers

| Service           | Data Transited    | Jurisdiction    | Safeguard                                    |
| ----------------- | ----------------- | --------------- | -------------------------------------------- |
| PostgreSQL        | All user data     | USA (us-east-1) | SCC + encryption at rest (AES-256) + TLS 1.3 |
| Better Auth (lib) | In-memory hashing | N/A (local lib) | No transfer                                  |
| Resend (email)    | Email, name       | USA             | SCC + Data Processing Agreement              |

Per LGPD Art. 33, adequate safeguards (Standard Contractual Clauses +
DPA) are maintained with each provider.

## Infrastructure Dependencies

The `withTenant(tenantId, fn)` helper is the mandatory entry point for
all queries involving tenant-scoped data within this bounded context:

- **Member queries** (reading/writing company memberships) MUST use
  `withTenant`.
- **Company queries** (reading company details, searching) MUST use
  `withTenant`.
- **Invite and permission data** (future scope) MUST use `withTenant`.
- Direct `db` access is permitted ONLY for company creation (onboarding)
  and global lookup tables — the initial `INSERT INTO companies` is the
  sole exception.

**Testing note**: Integration tests MUST verify that queries executed
outside `withTenant` return zero rows for tenant-scoped tables (RLS
deny by default). This validates that the RLS policy is correctly
enforcing isolation even when the application layer is bypassed.

**Concurrency testing**: The invite acceptance flow MUST be tested for
race conditions. Two simultaneous requests accepting the same invite
MUST result in exactly one membership created (the second request
fails with 409 Conflict). Tests MUST use PostgreSQL's
`SERIALIZABLE` isolation level or explicit locks to verify correct
behavior under concurrent access. The repository layer MUST use
row-level locking (`SELECT ... FOR UPDATE`) when reading invite status
before creating the membership.

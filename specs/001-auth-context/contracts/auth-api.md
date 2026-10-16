# Auth API Contracts

**Cobertura**: este arquivo documenta o contrato do **contexto auth** — os 7
fluxos de `/api/auth`, os recursos em `/api/v1` que dele derivam (`/me/*`,
`/companies*`, `/invitations*`), health e CORS. Rotas de domínio (`orders`,
`print`, `restaurant`) vivem nos contracts dos seus contextos.

**Versionamento** (ADR-005): somente os **fluxos de autenticação**
permanecem em `/api/auth` — `register`, `login`, `logout`, `password/*`,
`email/*` — sem versionamento, contrato próprio. O que vivia sob
`/api/auth` mas **não é fluxo de auth** (`/me`, `/companies`, `/invites`,
`/consents`, `/deactivate`, `/data-export`) migrou para `/api/v1`, porque
R5 põe o `companyId` no path. Health passou a `/api/health/live` e
`/api/health/ready`.

All endpoints follow consistent error format:

```json
{ "error": "snake_case_code", "message": "Human-readable message" }
```

Error codes: `validation_error` (400), `unauthorized` (401), `session_expired` (401), `forbidden` (403), `email_not_verified` (403), `csrf_invalid` (403), `not_found` (404), `conflict` (409), `rate_limit_exceeded` (429), `service_unavailable` (503), `upstream_timeout` (503), `auth_unavailable` (503), `internal_error` (500)

## Auth model

- **Session cookie**: `merp-session_token` (httpOnly; `Secure` + `SameSite=Lax`).
- **Session TTL**: fixed 7d from creation (`expiresIn: 7d`, `disableSessionRefresh: true`).
  `rememberMe: true` persists the cookie for 7d; without it the cookie is session-scoped.
  The DB row always expires 7d after creation (FR-009).
- **CSRF**: all `POST` endpoints require the `x-csrf-token` header matching the
  `merp-csrf_token` cookie, **except** the public account-recovery flows:
  `register`, `login`, `password/forgot`, `password/reset`,
  `email/verification`. `GET` endpoints never require CSRF.
- **Token nunca vai em path/query** (R6): `email/verification/confirm` e
  `password/reset` recebem o token **só no body**. Os links de e-mail apontam
  para páginas do Nuxt, que extraem o token da URL e fazem `POST` — a API não
  expõe token em URL nem em log.
- **Rate limits** (sliding window, 60s): 20 req/min per IP on public mutation
  endpoints, 5 req/min per email, 60 req/min per authenticated user (FR-010, AUD-16).
  `429` responses carry `Retry-After`, `RateLimit-Reset` and `RateLimit-Remaining` headers.
- **Lockout**: 10 failed logins lock the (email, IP) pair; 50 total failures lock the
  email globally. Both auto-unlock after 30min. Locked callers receive the same generic
  `401` as invalid credentials (anti-enumeration, FR-016, AUD-02).

---

## POST /api/auth/register

Register a new user account. Public. CSRF-exempt.

**Request Body**:

```json
{
  "email": "user@example.com",
  "password": "secure-password-123",
  "name": "User Name",
  "consentTermsVersion": "v1.0"
}
```

`name` and `consentTermsVersion` (LGPD legal basis, FR-021) are required.
Passwords: min 8 / max 128 chars, rejected when on the common-password deny-list
or found in breaches (HIBP k-anonymity, NIST 800-63B).

**Success Response**: `201 Created`

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "User Name",
  "createdAt": "2026-06-12T00:00:00Z"
}
```

**Note**: Registration does NOT create a session per FR-001. A verification link is
emailed on sign-up (`sendOnSignUp`); login is blocked until the email is verified (AUD-04).

**Error Responses**:

| Status | Error Code          | Condition                                                                              |
| ------ | ------------------- | -------------------------------------------------------------------------------------- |
| 400    | validation_error    | Invalid email / short, weak or breached password / missing name or consentTermsVersion |
| 429    | rate_limit_exceeded | Rate limit per IP (20/min) or per email (5/min)                                        |
| 503    | service_unavailable | Database unreachable                                                                   |

**Note (AUD-03)**: if the email is already registered, the endpoint returns the same generic `201 Created` response (id/name/createdAt derived from the request input) — no `409 conflict`, no observable difference between new and existing emails (anti-enumeration). No duplicate account is created and the existing account is never modified.

---

## POST /api/auth/login

Authenticate with email and password. Creates a session (FR-005). Public. CSRF-exempt.

**Request Body**:

```json
{
  "email": "user@example.com",
  "password": "secure-password-123",
  "rememberMe": false
}
```

**Success Response**: `200 OK` — Session cookie (`Set-Cookie`) set automatically.

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "User Name"
}
```

**Error Responses**:

| Status | Error Code          | Condition                                                                                                                                                                                                     |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | validation_error    | Missing email or password                                                                                                                                                                                     |
| 401    | unauthorized        | Invalid credentials (generic — no distinction between wrong password, non-existent user, locked, or deactivated account per CHK007; a deactivation notice email is sent to the account owner instead, AUD-06) |
| 403    | email_not_verified  | Correct password but email not verified (AUD-04; only reachable with the correct password — no enumeration). A fresh verification link is emailed automatically (`sendOnSignIn`).                             |
| 429    | rate_limit_exceeded | Rate limit per email exceeded (5 req/min sliding window, FR-010) or per IP (20 req/min)                                                                                                                       |
| 503    | service_unavailable | Database unreachable                                                                                                                                                                                          |

**Rate Limit Headers** (on 429): `Retry-After`, `RateLimit-Reset`, `RateLimit-Remaining`

**Note (AUD-04)**: `email_not_verified` does NOT count toward the per-email lockout (FR-010).

---

## POST /api/auth/email/verification

Resend the email verification link (AUD-04, FR-029). Public. CSRF-exempt.
Always answers `{ "status": true }` regardless of whether the account exists or is already verified (anti-enumeration).

**Request Body**:

```json
{
  "email": "user@example.com"
}
```

**Success Response**: `200 OK`

```json
{ "status": true }
```

**Error Responses**:

| Status | Error Code          | Condition                                               |
| ------ | ------------------- | ------------------------------------------------------- |
| 400    | validation_error    | Invalid email format                                    |
| 429    | rate_limit_exceeded | Rate limit per IP (20 req/min) or per email (5 req/min) |
| 503    | service_unavailable | Database unreachable                                    |

---

## POST /api/auth/email/verification/confirm

Confirm email ownership (AUD-04). Public. CSRF-exempt.
The token is a signed JWT (1h expiry). Idempotent: verifying an already-verified
email succeeds. Returns JSON (no redirect — the frontend routes on `{ status: true }`).

**Request Body** (R6: o token vem **só** no body, nunca em path/query):

```json
{ "token": "signed-jwt" }
```

**Success Response**: `200 OK`

```json
{ "status": true }
```

**Error Responses**:

| Status | Error Code          | Condition                                                                 |
| ------ | ------------------- | ------------------------------------------------------------------------- |
| 400    | validation_error    | Missing, expired or forged token (`Invalid or expired verification link`) |
| 429    | rate_limit_exceeded | Rate limit per IP (20 req/min)                                            |
| 503    | service_unavailable | Database unreachable                                                      |

---

## POST /api/auth/password/forgot

Request a password reset link (AUD-04, FR-030). Public. CSRF-exempt.
Always answers `{ "status": true, "message": ... }` regardless of whether the
account exists (anti-enumeration).

**Request Body**:

```json
{
  "email": "user@example.com"
}
```

**Success Response**: `200 OK`

```json
{
  "status": true,
  "message": "If this email exists in our system, check your email for the reset link"
}
```

**Error Responses**:

| Status | Error Code          | Condition                                               |
| ------ | ------------------- | ------------------------------------------------------- |
| 400    | validation_error    | Invalid email format                                    |
| 429    | rate_limit_exceeded | Rate limit per IP (20 req/min) or per email (5 req/min) |
| 503    | service_unavailable | Database unreachable                                    |

---

## POST /api/auth/password/reset

Set a new password with the single-use token from the forgot-password email
(AUD-04, FR-030). Public. CSRF-exempt. Revokes ALL existing sessions of the user
(`revokeSessionsOnPasswordReset`). The token is accepted **only in the body**
(R6 — nunca em path/query). The new password runs the same weak/breached
checks as registration.

**Request Body**:

```json
{
  "token": "single-use-token",
  "newPassword": "new-secure-password-456"
}
```

**Success Response**: `200 OK`

```json
{ "status": true }
```

**Error Responses**:

| Status | Error Code          | Condition                                                                                                                                     |
| ------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | validation_error    | Missing token, invalid/expired/consumed token (`Invalid or expired reset link`), or invalid password (min 8, max 128, not weak, not breached) |
| 429    | rate_limit_exceeded | Rate limit per IP (20 req/min)                                                                                                                |
| 503    | service_unavailable | Database unreachable                                                                                                                          |

---

## POST /api/auth/logout

Terminate the current session (FR-006). Requires session + CSRF token.

**Auth**: Required (session cookie)

**Success Response**: `200 OK`

```json
{ "message": "Logged out successfully" }
```

Emits `session_invalidated` + `logout` audit events (FR-023).

**Error Responses**:

| Status | Error Code   | Condition                  |
| ------ | ------------ | -------------------------- |
| 401    | unauthorized | No active session          |
| 403    | csrf_invalid | Missing/invalid CSRF token |

---

## GET /api/v1/me

Return the currently authenticated user and their company memberships.
Requires session. PII access is audit-logged (FR-022).

**Auth**: Required (session cookie)

**Success Response**: `200 OK`

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "User Name",
  "activeCompanyId": null,
  "companies": [{ "id": "uuid", "name": "Company Name", "role": "member" }]
}
```

> **`activeCompanyId` é sempre `null`** desde a migração R5: o endpoint
> `POST /auth/companies/switch` foi removido e nenhum caminho escreve mais
> nessa coluna (o único writer restante, `setActiveCompany`, está órfão).
> O campo permanece no contrato por compatibilidade, mas **não é fonte de
> tenant** — o escopo vive no path (`/api/v1/companies/{companyId}/...`) e o
> `role` vem do `companies[]` acima.

**Error Responses**:

| Status | Error Code      | Condition                                                  |
| ------ | --------------- | ---------------------------------------------------------- |
| 401    | unauthorized    | No active session                                          |
| 401    | session_expired | Session past TTL (FR-023, `session_expired` event emitted) |

---

## POST /api/v1/me/deactivate

Deactivate the own account (soft delete, FR-017). Requires session + CSRF token.
Terminates ALL sessions of the user immediately and emits `session_invalidated`

- `deactivation` audit events. Data is preserved (fiscal retention).

**Auth**: Required (session cookie)

**Success Response**: `200 OK`

```json
{ "message": "Account deactivated successfully" }
```

**Error Responses**:

| Status | Error Code   | Condition                  |
| ------ | ------------ | -------------------------- |
| 401    | unauthorized | No active session          |
| 403    | csrf_invalid | Missing/invalid CSRF token |

---

## POST /api/v1/me/consents/withdraw

Withdraw LGPD consent (FR-021). Requires session + CSRF token. Deactivates the
account immediately and terminates all sessions (same effect as `deactivate`,
plus a `consent_withdrawal` audit event carrying `consentWithdrawnAt`).
Automated PII deletion/anonymization queue is out of scope (deferred).

**Auth**: Required (session cookie)

**Success Response**: `200 OK`

```json
{ "message": "Consent withdrawn successfully" }
```

**Error Responses**:

| Status | Error Code   | Condition                  |
| ------ | ------------ | -------------------------- |
| 401    | unauthorized | No active session          |
| 403    | csrf_invalid | Missing/invalid CSRF token |

---

## GET /api/v1/me/data-export

LGPD data portability export (FR-020, Art. 18). Requires session.
PII access is audit-logged (FR-022).

**Auth**: Required (session cookie)

**Success Response**: `200 OK`

```json
{
  "profile": { "id": "uuid", "email": "user@example.com", "name": "User Name", "createdAt": "..." },
  "companies": [
    { "id": "uuid", "name": "Company Name", "cnpj": "...", "razaoSocial": "...", "role": "owner" }
  ],
  "sessions": [{ "id": "uuid", "createdAt": "...", "expiresAt": "..." }],
  "authEvents": [{ "id": "uuid", "eventType": "login", "ipAddress": "...", "createdAt": "..." }]
}
```

`authEvents` contains only events linked to the requesting user (`userId`).
Events recorded without a user id (e.g. failed logins for unknown emails) are excluded.

**Error Responses**:

| Status | Error Code   | Condition         |
| ------ | ------------ | ----------------- |
| 401    | unauthorized | No active session |

---

## POST /api/v1/companies

Create a new company. The requesting user becomes its first member with role
`owner` (FR-014). Requires session + CSRF token. `cnpj` (≤ 30 chars, check
digits validated when 14 digits are present) and `razaoSocial` are optional.

**Auth**: Required (session cookie)

**Request Body**:

```json
{
  "name": "Company Name",
  "cnpj": "12.345.678/0001-95",
  "razaoSocial": "Legal Name"
}
```

**Success Response**: `201 Created`

```json
{
  "id": "uuid",
  "name": "Company Name"
}
```

**Error Responses**:

| Status | Error Code          | Condition                                                              |
| ------ | ------------------- | ---------------------------------------------------------------------- |
| 400    | validation_error    | Missing/invalid `name`, oversized fields, or invalid CNPJ check digits |
| 401    | unauthorized        | No active session                                                      |
| 403    | csrf_invalid        | Missing/invalid CSRF token                                             |
| 409    | conflict            | CNPJ already registered                                                |
| 429    | rate_limit_exceeded | Rate limit per IP (20 req/min)                                         |
| 503    | service_unavailable | Database unreachable                                                   |

---

## GET /api/v1/companies?q=...

Search companies scoped to membership (FR-015, AUD-10): only companies where the
caller is a member are returned (name/CNPJ of unrelated companies never leak).
Requires session.

**Auth**: Required (session cookie)

**Query Parameters**: `q` (required, non-empty, max 100 chars — partial match on name or CNPJ)

**Success Response**: `200 OK`

```json
{
  "companies": [{ "id": "uuid", "name": "Company Name", "cnpj": "12.345.678/0001-95" }]
}
```

**Error Responses**:

| Status | Error Code       | Condition                   |
| ------ | ---------------- | --------------------------- |
| 400    | validation_error | Missing/empty/oversized `q` |
| 401    | unauthorized     | No active session           |

---

## PATCH /api/v1/companies/{companyId}

Update company fields (owner only). Requires session + CSRF token. At least one
of `name` / `cnpj` / `razaoSocial` must be present. Empty-string `cnpj` /
`razaoSocial` clears the field. Emits a `company_updated` audit event.

**Auth**: Required (session cookie)

**Path Params**: `companyId` (uuid) — validado pelo middleware `tenant`, que responde `404` para não-membro ou empresa inexistente (não vaza existência entre tenants).

**Request Body** (sem ids — R1/R5):

```json
{
  "name": "New Name",
  "cnpj": "12.345.678/0001-95",
  "razaoSocial": "New Legal Name"
}
```

**Success Response**: `200 OK` — the updated company row

**Error Responses**:

| Status | Error Code       | Condition                                                                             |
| ------ | ---------------- | ------------------------------------------------------------------------------------- |
| 400    | validation_error | No updatable field, oversized fields, or invalid CNPJ check digits                    |
| 401    | unauthorized     | No active session                                                                     |
| 403    | csrf_invalid     | Missing/invalid CSRF token                                                            |
| 403    | forbidden        | Caller is a member but not an owner (`Only company owners can update companies`)      |
| 404    | not_found        | Company not found, already deleted, **or caller is not a member** (middleware tenant) |
| 409    | conflict         | CNPJ already registered                                                               |

---

## DELETE /api/v1/companies/{companyId}

Soft-delete a company (owner only, FR-019). Requires session + CSRF token.
Sets `is_deleted`, purges all memberships and pending invites, and clears
`activeCompanyId` of sessions pointing at the company. Other tenants'
sessions stay valid. Emits a `company_deleted` audit event.

**Auth**: Required (session cookie)

**Path Params**: `companyId` (uuid)

**Request Body**: nenhum — `DELETE` não tem body (R3). O `companyId` vem do path.

**Success Response**: `200 OK`

```json
{ "message": "Company deleted successfully" }
```

**Error Responses**:

| Status | Error Code   | Condition                                                                             |
| ------ | ------------ | ------------------------------------------------------------------------------------- |
| 401    | unauthorized | No active session                                                                     |
| 403    | csrf_invalid | Missing/invalid CSRF token                                                            |
| 403    | forbidden    | Caller is a member but not an owner (`Only company owners can delete companies`)      |
| 404    | not_found    | Company not found, already deleted, **or caller is not a member** (middleware tenant) |

---

## DELETE /api/v1/companies/{companyId}/members/{userId}

Remove a company member (owner removes others) or leave a company (a member
sends **their own** `userId` in the path). Requires session + CSRF token.
Owners can never be removed — not even by themselves. Emits a `member_removed`
audit event.

**Auth**: Required (session cookie)

**Path Params**:

| Param       | Obrigatório | Observação                                            |
| ----------- | ----------- | ----------------------------------------------------- |
| `companyId` | sim         | validado pelo middleware tenant (`404` se não-membro) |
| `userId`    | sim         | o membro a remover; para sair, use o **seu** `userId` |

**Request Body**: nenhum — `DELETE` não tem body (R3).

**Success Response**: `200 OK`

```json
{ "message": "Member removed successfully" }
```

(or `{ "message": "Left company successfully" }` when `userId` is your own)

**Error Responses**:

| Status | Error Code   | Condition                                                                                      |
| ------ | ------------ | ---------------------------------------------------------------------------------------------- |
| 401    | unauthorized | No active session                                                                              |
| 403    | csrf_invalid | Missing/invalid CSRF token                                                                     |
| 403    | forbidden    | Not an owner when removing others, or the target is an owner (`Cannot remove a company owner`) |
| 404    | not_found    | Company not found / caller not a member (middleware tenant), or target member not found        |

---

## POST /api/v1/companies/{companyId}/invitations

Create an invite (owner only). Requires session + CSRF token.

**Auth**: Required (session cookie)

**Path Params**: `companyId` (uuid) — validado pelo middleware `tenant` (`404` para não-membro ou empresa inexistente).

**Request Body** (sem ids — R1/R5):

```json
{ "email": "user@example.com" }
```

**Success Response**: `201 Created`

```json
{
  "id": "uuid",
  "companyId": "uuid",
  "email": "user@example.com",
  "expiresAt": "2026-08-19T00:00:00Z",
  "token": "single-use-secret-token"
}
```

**Note (AUD-01)**: the `token` (256-bit, SHA-256 hash stored) is returned **exactly once** — it is never
exposed again (`GET /invites` returns metadata only, without token). The token
expires after 7 days and is consumed on first successful accept. Emits an
`invite_created` audit event (without the token).

**Error Responses**:

| Status | Error Code          | Condition                                                 |
| ------ | ------------------- | --------------------------------------------------------- |
| 400    | validation_error    | `email` missing/invalid                                   |
| 401    | unauthorized        | No active session                                         |
| 403    | csrf_invalid        | Missing/invalid CSRF token                                |
| 403    | forbidden           | Caller is a member but not an owner of the company        |
| 404    | not_found           | Company not found, deleted, **or caller is not a member** |
| 409    | conflict            | Invite already exists for this company and email          |
| 429    | rate_limit_exceeded | Rate limit per IP (20 req/min)                            |

---

## POST /api/v1/me/invitations/accept

Accept an invite by its secret token (AUD-01). Requires session + CSRF token;
the invite target email must match the **session email** (never the body).
The token identifies the invite — no `companyId` needed. Single-use:
concurrent accepts resolve to exactly one membership (the loser gets 404);
an already-member accept gets 409 without consuming the token.

**Auth**: Required (session cookie)

**Request Body**:

```json
{
  "token": "single-use-secret-token"
}
```

**Success Response**: `200 OK`

```json
{
  "id": "uuid",
  "companyId": "uuid",
  "acceptedAt": "2026-08-12T00:00:00Z"
}
```

Emits an `invite_accepted` audit event.

**Note (AUD-01)**: all failure modes (invalid, expired, consumed, wrong email)
return the same generic 404 — no enumeration.

**Error Responses**:

| Status | Error Code          | Condition                                                      |
| ------ | ------------------- | -------------------------------------------------------------- |
| 400    | validation_error    | `token` missing                                                |
| 401    | unauthorized        | No active session                                              |
| 403    | csrf_invalid        | Missing/invalid CSRF token                                     |
| 404    | not_found           | Invite not found, expired, already consumed, or email mismatch |
| 409    | conflict            | User is already a member of this company                       |
| 429    | rate_limit_exceeded | Rate limit per IP (20 req/min)                                 |

---

## GET /api/v1/me/invitations?companyId=...

List invites of a company (metadata only — never tokens, AUD-01).
Requires session; caller must be a member of the company.

**Auth**: Required (session cookie)

**Query Params**: `companyId` (required)

**Success Response**: `200 OK`

```json
{
  "invites": [
    {
      "id": "uuid",
      "companyId": "uuid",
      "email": "user@example.com",
      "invitedBy": "uuid",
      "acceptedAt": null,
      "expiresAt": "2026-08-19T00:00:00Z",
      "createdAt": "2026-08-12T00:00:00Z"
    }
  ]
}
```

**Error Responses**:

| Status | Error Code       | Condition                             |
| ------ | ---------------- | ------------------------------------- |
| 400    | validation_error | `companyId` missing                   |
| 401    | unauthorized     | No active session                     |
| 403    | forbidden        | Caller is not a member of the company |
| 404    | not_found        | Company not found or deleted          |

---

## GET /api/health/live

Liveness (FR-025). Public, CSRF-exempt. **Always `200 OK`** enquanto o processo
responde — não toca em DB nem em auth, para o healthcheck do Docker/load
balancer não reiniciar o container por uma dependência temporariamente fora.

```json
{ "status": "ok" }
```

---

## GET /api/health/ready

Readiness (FR-028). Public, CSRF-exempt. `200 OK` só com o banco acessível;
**`503 Service Unavailable`** quando o banco está indisponível (fail-closed,
para o load balancer tirar a instância do rotation).

**Success**: `200 OK`

```json
{ "status": "ok", "auth": "ready", "db": "ok" }
```

**Down**: `503 Service Unavailable`

```json
{ "status": "unavailable", "auth": "ready", "db": "unavailable" }
```

`auth: "unavailable"` quando a instância Better Auth falhou ao inicializar.

> **Removido**: `GET /api/metrics` não existe mais — o endpoint Prometheus foi
> retirado junto com a migração R5.

---

## GET /.well-known/security.txt

RFC 9116 security contact file. Public, cacheable (`max-age=86400`).

> O path **não** tem prefixo `/api` — o handler vive em
> `server/routes/.well-known/` (Nitro mapeia `server/routes/**` na raiz), fora
> do `server/api/`. Exige `BETTER_AUTH_URL` para montar os contatos; sem ela,
> cai no domínio padrão `app.merp.com.br`.

---

## CORS Configuration

- **Allowed Origin**: Explicit origin (e.g., `https://app.merp.com.br`) — no wildcard
- **Credentials**: `Access-Control-Allow-Credentials: true`
- **Methods**: GET, POST, OPTIONS
- **Preflight**: OPTIONS requests responded with appropriate CORS headers per FR-027

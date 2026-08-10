# Auth API Contracts

Base path: `/api/auth`

All endpoints follow consistent error format:

```json
{ "error": "snake_case_code", "message": "Human-readable message" }
```

Error codes: `validation_error`, `conflict` (409), `unauthorized` (401), `session_expired` (401), `rate_limit_exceeded` (429), `service_unavailable` (503), `upstream_timeout` (503), `auth_unavailable` (503), `internal_error` (500)

---

## POST /api/auth/register

Register a new user account.

**Request Body**:

```json
{
  "email": "user@example.com",
  "password": "secure-password-123",
  "name": "User Name (optional)"
}
```

**Success Response**: `201 Created`

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "User Name",
  "createdAt": "2026-06-12T00:00:00Z"
}
```

**Note**: Registration does NOT create a session per FR-001.

**Error Responses**:
| Status | Error Code | Condition |
|--------|------------|-----------|
| 400 | validation_error | Invalid email format / password too short |
| 429 | rate_limit_exceeded | Rate limit per email exceeded |
| 503 | service_unavailable | Database unreachable |

**Note (AUD-03)**: if the email is already registered, the endpoint returns the same generic `201 Created` response (id/name/createdAt derived from the request input) — no `409 conflict`, no observable difference between new and existing emails (anti-enumeration). No duplicate account is created and the existing account is never modified.

---

## POST /api/auth/login

Authenticate with email and password. Creates a session (FR-005).

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
| Status | Error Code | Condition |
|--------|------------|-----------|
| 400 | validation_error | Missing email or password |
| 401 | unauthorized | Invalid credentials (generic — no distinction between wrong password, non-existent user, or locked account per CHK007) |
| 401 | account_deactivated | User has been deactivated |
| 429 | rate_limit_exceeded | Rate limit per email exceeded (5 req/min sliding window, FR-010) or per IP (20 req/min) |
| 503 | service_unavailable | Database unreachable |

**Rate Limit Headers** (on 429): `Retry-After`, `RateLimit-Reset`, `RateLimit-Remaining`

---

## POST /api/auth/logout

Terminate the current session (FR-006).

**Auth**: Required (session cookie)

**Success Response**: `200 OK`

```json
{ "message": "Logged out successfully" }
```

**Error Responses**:
| Status | Error Code | Condition |
|--------|------------|-----------|
| 401 | unauthorized | No active session |

---

## GET /api/auth/me

Return the currently authenticated user and active company context.

**Auth**: Required (session cookie)

**Success Response**: `200 OK`

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "User Name",
  "activeCompanyId": "uuid-or-null",
  "companies": [{ "id": "uuid", "name": "Company Name", "role": "member" }]
}
```

**Error Responses**:
| Status | Error Code | Condition |
|--------|------------|-----------|
| 401 | unauthorized | No active session |
| 401 | session_expired | Session past TTL (FR-023, `session_expired` event emitted) |

---

## POST /api/auth/companies

Create a new company. The requesting user becomes its first member (FR-014).

**Auth**: Required (session cookie)

**Request Body**:

```json
{
  "name": "Company Name",
  "cnpj": "XX.XXX.XXX/XXXX-XX",
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
| Status | Error Code | Condition |
|--------|------------|-----------|
| 400 | validation_error | Missing or invalid fields |
| 409 | conflict | CNPJ already registered |
| 503 | service_unavailable | Database unreachable |

---

## POST /api/auth/companies/join

Join an existing company by ID (FR-015).

**Auth**: Required (session cookie)

**Request Body**:

```json
{
  "companyId": "uuid"
}
```

**Success Response**: `200 OK`

```json
{ "message": "Joined company successfully" }
```

**Error Responses**:
| Status | Error Code | Condition |
|--------|------------|-----------|
| 400 | validation_error | Missing companyId |
| 404 | not_found | Company not found or deleted |
| 409 | conflict | User is already a member of this company |

---

## GET /api/auth/companies

Search for companies to join (FR-015).

**Auth**: Required (session cookie)

**Query Parameters**:

- `q` — search query (name or CNPJ partial match)

**Success Response**: `200 OK`

```json
{
  "companies": [{ "id": "uuid", "name": "Company Name", "cnpj": "XX.XXX.XXX/XXXX-XX" }]
}
```

---

## POST /api/auth/companies/switch

Switch the active company context for the current session.

**Auth**: Required (session cookie)

**Request Body**:

```json
{
  "companyId": "uuid"
}
```

**Success Response**: `200 OK`

```json
{ "message": "Active company switched" }
```

**Error Responses**:
| Status | Error Code | Condition |
|--------|------------|-----------|
| 403 | forbidden | User is not a member of the specified company |
| 404 | not_found | Company not found or deleted |

---

## CORS Configuration

- **Allowed Origin**: Explicit origin (e.g., `https://app.merp.com.br`) — no wildcard
- **Credentials**: `Access-Control-Allow-Credentials: true`
- **Methods**: GET, POST, OPTIONS
- **Preflight**: OPTIONS requests responded with appropriate CORS headers per FR-027

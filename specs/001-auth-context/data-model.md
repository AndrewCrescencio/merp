# Data Model: Auth Bounded Context

## Entities

### User

| Field                     | Type        | Constraints                                         |
| ------------------------- | ----------- | --------------------------------------------------- |
| id                        | UUID        | PK, default `gen_random_uuid()`                     |
| email                     | TEXT        | NOT NULL, UNIQUE, validated format (RFC 5321)       |
| name                      | TEXT        | NULLABLE, PII                                       |
| email_verified            | BOOLEAN     | NOT NULL, DEFAULT false                             |
| image                     | TEXT        | NULLABLE                                            |
| is_active                 | BOOLEAN     | NOT NULL, DEFAULT true — soft delete flag           |
| two_factor_enabled        | BOOLEAN     | NOT NULL, DEFAULT false                             |
| consent_terms_version     | TEXT        | NULLABLE — LGPD consent tracking                    |
| consent_terms_accepted_at | TIMESTAMPTZ | NULLABLE                                            |
| consent_withdrawn_at      | TIMESTAMPTZ | NULLABLE — triggers deactivation + deletion request |
| created_at                | TIMESTAMPTZ | NOT NULL, DEFAULT now()                             |
| updated_at                | TIMESTAMPTZ | NOT NULL, DEFAULT now()                             |

> **Note**: `hashed_password` is NOT in the `user` table — it is managed by Better Auth in the `account` table (column `password`).

**Unique constraints**: email (UNIQUE index)
**Indexes**: email (for login lookup), is_active (for deactivation queries)

### Session

| Field       | Type        | Constraints                                        |
| ----------- | ----------- | -------------------------------------------------- |
| id          | UUID        | PK                                                 |
| user_id     | UUID        | NOT NULL, FK → User.id                             |
| token       | TEXT        | NOT NULL, UNIQUE — session token (httpOnly cookie) |
| expires_at  | TIMESTAMPTZ | NOT NULL — fixed 7d TTL from creation (no refresh) |
| remember_me | BOOLEAN     | NOT NULL, DEFAULT false                            |
| created_at  | TIMESTAMPTZ | NOT NULL, DEFAULT now()                            |
| updated_at  | TIMESTAMPTZ | NOT NULL, DEFAULT now()                            |

**Indexes**: token (session lookup), user_id (user sessions), expires_at (purge expired)

### Company (Tenant)

| Field        | Type        | Constraints                                                     |
| ------------ | ----------- | --------------------------------------------------------------- |
| id           | UUID        | PK, default `gen_random_uuid()`                                 |
| name         | TEXT        | NOT NULL — company name                                         |
| cnpj         | TEXT        | NULLABLE, UNIQUE — Brazilian CNPJ (fiscal identifier)           |
| razao_social | TEXT        | NULLABLE — legal business name (fiscal)                         |
| is_deleted   | BOOLEAN     | NOT NULL, DEFAULT false — soft delete for referential integrity |
| created_at   | TIMESTAMPTZ | NOT NULL, DEFAULT now()                                         |
| updated_at   | TIMESTAMPTZ | NOT NULL, DEFAULT now()                                         |

**Indexes**: cnpj (lookup), is_deleted (active company queries)

### CompanyMember

| Field      | Type        | Constraints                                        |
| ---------- | ----------- | -------------------------------------------------- |
| id         | UUID        | PK                                                 |
| company_id | UUID        | NOT NULL, FK → Company.id                          |
| user_id    | UUID        | NOT NULL, FK → User.id                             |
| role       | TEXT        | NOT NULL, DEFAULT 'member' — future RBAC extension |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now()                            |

**Unique constraints**: (company_id, user_id) — prevents duplicate membership
**Indexes**: user_id (user's companies), company_id (company members)

### AuthEvent (Audit Log)

| Field      | Type        | Constraints                                                                                                                                                                                                                                                                   |
| ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id         | UUID        | PK                                                                                                                                                                                                                                                                            |
| user_id    | UUID        | NULLABLE — anonymous events (failed login) have no user                                                                                                                                                                                                                       |
| email      | TEXT        | NOT NULL — always record attempted email                                                                                                                                                                                                                                      |
| event_type | TEXT        | NOT NULL — one of: registration, login, failed_login, logout, session_created, session_validated, session_expired, session_invalidated, account_locked, account_unlocked, deactivation, consent_withdrawal, company_deleted, company_updated, invite_accepted, member_removed |
| ip_address | INET        | NULLABLE — retained 90 days per LGPD                                                                                                                                                                                                                                          |
| metadata   | JSONB       | NULLABLE — event-specific data (error code, device info)                                                                                                                                                                                                                      |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now()                                                                                                                                                                                                                                                       |

**Indexes**: user_id, email, event_type, created_at (reporting queries)

### Invite

| Field       | Type        | Constraints                        |
| ----------- | ----------- | ---------------------------------- |
| id          | UUID        | PK                                 |
| company_id  | UUID        | NOT NULL, FK → Company.id          |
| email       | TEXT        | NOT NULL                           |
| invited_by  | UUID        | NOT NULL, FK → User.id             |
| accepted_at | TIMESTAMPTZ | NULLABLE                           |
| expires_at  | TIMESTAMPTZ | NOT NULL — purged 30d after expiry |
| created_at  | TIMESTAMPTZ | NOT NULL, DEFAULT now()            |

**Unique constraints**: (company_id, email) — one pending invite per email per company
**Indexes**: email + accepted_at IS NULL (lookup pending invites)

### Account (OAuth / Better Auth)

| Field                    | Type        | Constraints                                      |
| ------------------------ | ----------- | ------------------------------------------------ |
| id                       | UUID        | PK, default `gen_random_uuid()`                  |
| user_id                  | UUID        | NOT NULL, FK → User.id                           |
| account_id               | TEXT        | NOT NULL                                         |
| provider_id              | TEXT        | NOT NULL                                         |
| access_token             | TEXT        | NULLABLE                                         |
| refresh_token            | TEXT        | NULLABLE                                         |
| access_token_expires_at  | TIMESTAMPTZ | NULLABLE                                         |
| refresh_token_expires_at | TIMESTAMPTZ | NULLABLE                                         |
| scope                    | TEXT        | NULLABLE                                         |
| id_token                 | TEXT        | NULLABLE                                         |
| password                 | TEXT        | NULLABLE — hashed password (Better Auth managed) |
| created_at               | TIMESTAMPTZ | NOT NULL, DEFAULT now()                          |
| updated_at               | TIMESTAMPTZ | NOT NULL, DEFAULT now()                          |

**Indexes**: user_id (user's accounts)

### Verification (Email/Password Reset Tokens)

| Field      | Type        | Constraints                     |
| ---------- | ----------- | ------------------------------- |
| id         | UUID        | PK, default `gen_random_uuid()` |
| identifier | TEXT        | NOT NULL — email or phone       |
| value      | TEXT        | NOT NULL — token hash           |
| expires_at | TIMESTAMPTZ | NOT NULL                        |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now()         |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now()         |

**Indexes**: identifier (lookup by email)

### TwoFactor (2FA TOTP + Backup Codes)

| Field        | Type        | Constraints                           |
| ------------ | ----------- | ------------------------------------- |
| id           | UUID        | PK, default `gen_random_uuid()`       |
| secret       | TEXT        | NOT NULL — TOTP secret                |
| backup_codes | TEXT        | NOT NULL — JSON array of backup codes |
| user_id      | UUID        | NOT NULL, FK → User.id                |
| created_at   | TIMESTAMPTZ | NOT NULL, DEFAULT now()               |
| updated_at   | TIMESTAMPTZ | NOT NULL, DEFAULT now()               |

**Indexes**: user_id (user's 2FA config)

### EmailQueue (Async Email Delivery)

| Field        | Type        | Constraints                                       |
| ------------ | ----------- | ------------------------------------------------- |
| id           | UUID        | PK, default `gen_random_uuid()`                   |
| to           | TEXT        | NOT NULL                                          |
| subject      | TEXT        | NOT NULL                                          |
| html         | TEXT        | NOT NULL                                          |
| attempts     | INTEGER     | NOT NULL, DEFAULT 0                               |
| max_attempts | INTEGER     | NOT NULL, DEFAULT 3                               |
| status       | TEXT        | NOT NULL, DEFAULT 'pending' — pending/sent/failed |
| last_error   | TEXT        | NULLABLE                                          |
| scheduled_at | TIMESTAMPTZ | NOT NULL, DEFAULT now()                           |
| sent_at      | TIMESTAMPTZ | NULLABLE                                          |
| created_at   | TIMESTAMPTZ | NOT NULL, DEFAULT now()                           |
| updated_at   | TIMESTAMPTZ | NOT NULL, DEFAULT now()                           |

**Indexes**: status, scheduled_at (queue processing)

### AuthSecurityState (Rate Limiting + Lockout)

| Field        | Type        | Constraints                                         |
| ------------ | ----------- | --------------------------------------------------- |
| key          | TEXT        | PK — format: `rate:email`, `lockout:email:ip`, etc. |
| count        | INTEGER     | NOT NULL, DEFAULT 0                                 |
| locked_until | TIMESTAMPTZ | NULLABLE                                            |
| reset_at     | TIMESTAMPTZ | NULLABLE                                            |
| window       | JSONB       | NOT NULL, DEFAULT '[]' — ISO timestamps in window   |
| updated_at   | TIMESTAMPTZ | NOT NULL, DEFAULT now()                             |

**Indexes**: reset_at (purge expired)

## Relationships

```
User 1──N Session
User 1──N CompanyMember N──1 Company
User 1──N AuthEvent
User 1──N Invite (as inviter)
User 1──N Account
User 1──N Verification
User 1──1 TwoFactor
Company 1──N CompanyMember
Company 1──N Invite
```

## State Transitions

### User Lifecycle

```
[Registered] ──→ [Active] ──→ [Deactivated] ──→ [Anonymized] (after 5yr retention)
                  ↑               │
                  └── auto-unlock after 30min lockout
```

- **Active**: Can login, create/join companies
- **Locked** (transient): After 10 failed attempts, auto-unlock after 30min. Not a persistent state — checked at login time.
- **Deactivated**: Soft delete — cannot login, data preserved
- **Anonymized**: After 5yr retention — email/name stripped, hashed_password destroyed, IP truncated to /24

### Session Lifecycle

```
[Created] ──→ [Active] ──→ [Expired] (after TTL)
                         ──→ [Invalidated] (logout / deactivation)
```

## Tenant Isolation

- `Company` table: RLS by company_id (owner/global access)
- `CompanyMember` table: RLS by company_id
- `Invite` table: RLS by company_id
- `User` + `Session` + `Account` + `Verification` + `TwoFactor`: Global tables (no tenant_id) — auth is cross-tenant
- `AuthEvent`: Global table — audit is cross-tenant
- `EmailQueue`: Global table — `merp_app` role has full DML
- `AuthSecurityState`: Global table — `merp_app` role has full DML

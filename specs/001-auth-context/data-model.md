# Data Model: Auth Bounded Context

**Nota (2026-10):** o schema Drizzle vive em
`server/utils/schema/{identity,company,invite,security,email}.ts`.
Todas as PKs são `TEXT` com `DEFAULT gen_random_uuid()` — o **valor** é
UUID, mas o **tipo de coluna** é `text`. Ver ADR-006.

## Entities

### User

| Field                     | Type              | Constraints                                         |
| ------------------------- | ----------------- | --------------------------------------------------- |
| id                        | TEXT (UUID value) | PK, default `gen_random_uuid()`                     |
| email                     | TEXT              | NOT NULL, UNIQUE, validated format (RFC 5321)       |
| name                      | TEXT              | NULLABLE, PII                                       |
| email_verified            | BOOLEAN           | NOT NULL, DEFAULT false                             |
| image                     | TEXT              | NULLABLE                                            |
| is_active                 | BOOLEAN           | NOT NULL, DEFAULT true — soft delete flag           |
| two_factor_enabled        | BOOLEAN           | NOT NULL, DEFAULT false                             |
| consent_terms_version     | TEXT              | NULLABLE — LGPD consent tracking                    |
| consent_terms_accepted_at | TIMESTAMPTZ       | NULLABLE                                            |
| consent_withdrawn_at      | TIMESTAMPTZ       | NULLABLE — triggers deactivation + deletion request |
| created_at                | TIMESTAMPTZ       | NOT NULL, DEFAULT now()                             |
| updated_at                | TIMESTAMPTZ       | NOT NULL, DEFAULT now()                             |

> **Note**: `hashed_password` is NOT in the `user` table — it is managed by Better Auth in the `account` table (column `password`).

**Unique constraints**: email (UNIQUE index)
**Indexes**: email (for login lookup), is_active (for deactivation queries)

### Session

| Field             | Type              | Constraints                                                    |
| ----------------- | ----------------- | -------------------------------------------------------------- |
| id                | TEXT (UUID value) | PK                                                             |
| user_id           | TEXT (UUID value) | NOT NULL, FK → User.id                                         |
| token             | TEXT              | NOT NULL, UNIQUE — session token (httpOnly cookie)             |
| expires_at        | TIMESTAMPTZ       | NOT NULL — fixed 7d TTL from creation (no refresh)             |
| remember_me       | BOOLEAN           | NOT NULL, DEFAULT false                                        |
| active_company_id | UUID              | **LEGADO MORTO** — nenhum caminho lê/escreve (ver rest-api.md) |
| created_at        | TIMESTAMPTZ       | NOT NULL, DEFAULT now()                                        |
| updated_at        | TIMESTAMPTZ       | NOT NULL, DEFAULT now()                                        |

**Indexes**: token (session lookup), user_id (user sessions), expires_at (purge expired)

### Company (Tenant)

| Field        | Type              | Constraints                                                     |
| ------------ | ----------------- | --------------------------------------------------------------- |
| id           | TEXT (UUID value) | PK, default `gen_random_uuid()`                                 |
| name         | TEXT              | NOT NULL — company name                                         |
| cnpj         | TEXT              | NULLABLE, UNIQUE — Brazilian CNPJ (fiscal identifier)           |
| razao_social | TEXT              | NULLABLE — legal business name (fiscal)                         |
| is_deleted   | BOOLEAN           | NOT NULL, DEFAULT false — soft delete for referential integrity |
| created_at   | TIMESTAMPTZ       | NOT NULL, DEFAULT now()                                         |
| updated_at   | TIMESTAMPTZ       | NOT NULL, DEFAULT now()                                         |

**Indexes**: cnpj (lookup), is_deleted (active company queries)

### CompanyMember

| Field               | Type              | Constraints                                                 |
| ------------------- | ----------------- | ----------------------------------------------------------- |
| id                  | TEXT (UUID value) | PK                                                          |
| company_id          | TEXT (UUID value) | NOT NULL, FK → Company.id                                   |
| user_id             | TEXT (UUID value) | NOT NULL, FK → User.id                                      |
| role                | TEXT              | NOT NULL, DEFAULT 'member' — future RBAC extension          |
| default_location_id | TEXT (UUID value) | NULLABLE, FK → Location.id (`ON DELETE SET NULL`) — ADR-002 |
| created_at          | TIMESTAMPTZ       | NOT NULL, DEFAULT now()                                     |

**Unique constraints**: (company_id, user_id) — prevents duplicate membership
**Indexes**: user_id (user's companies), company_id (company members), default_location_id

`default_location_id` é a fonte do `location_id` no escopo do membro
(`resolveLocationId` em `server/utils/shared/location.ts`). `NULL` é estado
legítimo: "sem location no escopo" → a RLS cai no escopo company pelo escape
`OR get_location_id() IS NULL` de ADR-002.

### AuthEvent (Audit Log)

| Field      | Type              | Constraints                                                                                                                                                                                                                                                                   |
| ---------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id         | TEXT (UUID value) | PK                                                                                                                                                                                                                                                                            |
| user_id    | TEXT (UUID value) | NULLABLE — anonymous events (failed login) have no user                                                                                                                                                                                                                       |
| email      | TEXT              | NOT NULL — always record attempted email                                                                                                                                                                                                                                      |
| event_type | TEXT              | NOT NULL — one of: registration, login, failed_login, logout, session_created, session_validated, session_expired, session_invalidated, account_locked, account_unlocked, deactivation, consent_withdrawal, company_deleted, company_updated, invite_accepted, member_removed |
| ip_address | INET              | NULLABLE — retained 90 days per LGPD                                                                                                                                                                                                                                          |
| metadata   | JSONB             | NULLABLE — event-specific data (error code, device info)                                                                                                                                                                                                                      |
| created_at | TIMESTAMPTZ       | NOT NULL, DEFAULT now()                                                                                                                                                                                                                                                       |

**Indexes**: user_id, email, event_type, created_at (reporting queries)

### Invite

| Field       | Type              | Constraints                        |
| ----------- | ----------------- | ---------------------------------- |
| id          | TEXT (UUID value) | PK                                 |
| company_id  | TEXT (UUID value) | NOT NULL, FK → Company.id          |
| invited_by  | TEXT (UUID value) | NOT NULL, FK → User.id             |
| accepted_at | TIMESTAMPTZ       | NULLABLE                           |
| expires_at  | TIMESTAMPTZ       | NOT NULL — purged 30d after expiry |
| created_at  | TIMESTAMPTZ       | NOT NULL, DEFAULT now()            |

**Unique constraints**: (company_id, email) — one pending invite per email per company
**Indexes**: email + accepted_at IS NULL (lookup pending invites)

### Account (OAuth / Better Auth)

| Field                    | Type              | Constraints                                      |
| ------------------------ | ----------------- | ------------------------------------------------ |
| id                       | TEXT (UUID value) | PK, default `gen_random_uuid()`                  |
| user_id                  | TEXT (UUID value) | NOT NULL, FK → User.id                           |
| account_id               | TEXT              | NOT NULL                                         |
| provider_id              | TEXT              | NOT NULL                                         |
| access_token             | TEXT              | NULLABLE                                         |
| refresh_token            | TEXT              | NULLABLE                                         |
| access_token_expires_at  | TIMESTAMPTZ       | NULLABLE                                         |
| refresh_token_expires_at | TIMESTAMPTZ       | NULLABLE                                         |
| scope                    | TEXT              | NULLABLE                                         |
| id_token                 | TEXT              | NULLABLE                                         |
| password                 | TEXT              | NULLABLE — hashed password (Better Auth managed) |
| created_at               | TIMESTAMPTZ       | NOT NULL, DEFAULT now()                          |
| updated_at               | TIMESTAMPTZ       | NOT NULL, DEFAULT now()                          |

**Indexes**: user_id (user's accounts)

### Verification (Email/Password Reset Tokens)

| Field      | Type              | Constraints                     |
| ---------- | ----------------- | ------------------------------- |
| id         | TEXT (UUID value) | PK, default `gen_random_uuid()` |
| identifier | TEXT              | NOT NULL — email or phone       |
| value      | TEXT              | NOT NULL — token hash           |
| expires_at | TIMESTAMPTZ       | NOT NULL                        |
| created_at | TIMESTAMPTZ       | NOT NULL, DEFAULT now()         |
| updated_at | TIMESTAMPTZ       | NOT NULL, DEFAULT now()         |

**Indexes**: identifier (lookup by email)

### EmailQueue (Async Email Delivery)

| Field        | Type              | Constraints                                       |
| ------------ | ----------------- | ------------------------------------------------- |
| id           | TEXT (UUID value) | PK, default `gen_random_uuid()`                   |
| to           | TEXT              | NOT NULL                                          |
| subject      | TEXT              | NOT NULL                                          |
| html         | TEXT              | NOT NULL                                          |
| attempts     | INTEGER           | NOT NULL, DEFAULT 0                               |
| max_attempts | INTEGER           | NOT NULL, DEFAULT 3                               |
| status       | TEXT              | NOT NULL, DEFAULT 'pending' — pending/sent/failed |
| last_error   | TEXT              | NULLABLE                                          |
| scheduled_at | TIMESTAMPTZ       | NOT NULL, DEFAULT now()                           |
| sent_at      | TIMESTAMPTZ       | NULLABLE                                          |
| created_at   | TIMESTAMPTZ       | NOT NULL, DEFAULT now()                           |
| updated_at   | TIMESTAMPTZ       | NOT NULL, DEFAULT now()                           |

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

Ver `specs/000-foundation/rls-pattern.md` — template de policy normativo, matriz
tabela × operação × role, assinatura `withTenant`, GUCs oficiais, fail-closed,
proibições e cross-tenant legítimo.

Resumo das tabelas auth:

- `Company`, `CompanyMember`, `Invite`: RLS por `company_id`
- `User`, `Session`, `Account`, `Verification`: Tabelas globais (sem tenant_id) — auth é cross-tenant
- `AuthEvent`: Tabela global — auditoria é cross-tenant
- `EmailQueue`, `AuthSecurityState`: Tabelas globais — `merp_app` tem DML total

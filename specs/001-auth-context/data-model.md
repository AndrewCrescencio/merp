# Data Model: Auth Bounded Context

## Entities

### User

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK, default `gen_random_uuid()` |
| email | TEXT | NOT NULL, UNIQUE, validated format (RFC 5321) |
| name | TEXT | NULLABLE, PII |
| hashed_password | TEXT | NOT NULL, bcrypt (cost 10+) |
| is_active | BOOLEAN | NOT NULL, DEFAULT true — soft delete flag |
| consent_terms_version | TEXT | NULLABLE — LGPD consent tracking |
| consent_terms_accepted_at | TIMESTAMPTZ | NULLABLE |
| consent_withdrawn_at | TIMESTAMPTZ | NULLABLE — triggers deactivation + deletion request |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Unique constraints**: email (UNIQUE index)
**Indexes**: email (for login lookup), is_active (for deactivation queries)

### Session

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| user_id | UUID | NOT NULL, FK → User.id |
| token | TEXT | NOT NULL, UNIQUE — session token (httpOnly cookie) |
| expires_at | TIMESTAMPTZ | NOT NULL — 24h default, 7d with remember-me |
| remember_me | BOOLEAN | NOT NULL, DEFAULT false |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Indexes**: token (session lookup), user_id (user sessions), expires_at (purge expired)

### Company (Tenant)

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK, default `gen_random_uuid()` |
| name | TEXT | NOT NULL — company name |
| cnpj | TEXT | NULLABLE, UNIQUE — Brazilian CNPJ (fiscal identifier) |
| razao_social | TEXT | NULLABLE — legal business name (fiscal) |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false — soft delete for referential integrity |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Indexes**: cnpj (lookup), is_deleted (active company queries)

### CompanyMember

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| company_id | UUID | NOT NULL, FK → Company.id |
| user_id | UUID | NOT NULL, FK → User.id |
| role | TEXT | NOT NULL, DEFAULT 'member' — future RBAC extension |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Unique constraints**: (company_id, user_id) — prevents duplicate membership
**Indexes**: user_id (user's companies), company_id (company members)

### AuthEvent (Audit Log)

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| user_id | UUID | NULLABLE — anonymous events (failed login) have no user |
| email | TEXT | NOT NULL — always record attempted email |
| event_type | TEXT | NOT NULL — one of: registration, login, failed_login, logout, session_expired, account_locked, account_unlocked, deactivation, consent_withdrawal |
| ip_address | INET | NULLABLE — retained 90 days per LGPD |
| metadata | JSONB | NULLABLE — event-specific data (error code, device info) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Indexes**: user_id, email, event_type, created_at (reporting queries)

### Invite

| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| company_id | UUID | NOT NULL, FK → Company.id |
| email | TEXT | NOT NULL |
| invited_by | UUID | NOT NULL, FK → User.id |
| accepted_at | TIMESTAMPTZ | NULLABLE |
| expires_at | TIMESTAMPTZ | NOT NULL — purged 30d after expiry |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Unique constraints**: (company_id, email) — one pending invite per email per company
**Indexes**: email + accepted_at IS NULL (lookup pending invites)

## Relationships

```
User 1──N Session
User 1──N CompanyMember N──1 Company
User 1──N AuthEvent
User 1──N Invite (as inviter)
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
- `User` + `Session`: Global tables (no tenant_id) — auth is cross-tenant
- `AuthEvent`: Global table — audit is cross-tenant

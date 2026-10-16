# Consolidated Specification: Auth, Core Order, and Print

## Overview

This consolidated specification combines the auth bounded context, core order module, print operational module, API contracts, and database schema references into a single source of truth for the Merp application.

---

## 1. Auth Bounded Context

### 1.1 Session Management

- **TTL**: Fixed 7 days from creation (`expiresIn: 7d`, `disableSessionRefresh: true` — no sliding refresh)
- **rememberMe**: Persists cookie for 7 days; without it, cookie is session-scoped
- **Session expiry mid-request**: Return HTTP 401 with `{ "error": "session_expired", "message": "Session expired. Please login again." }` and `session_expired` error code
- **Concurrent sessions**: Allowed per FR-012 (different devices/browsers)

### 1.2 Authentication Operations

- **Registration**: Email + password. Duplicate email returns 201 Created (anti-enumeration, AUD-03), never 409
- **Login**: Email + password. On success: cookie `merp-session_token` (httpOnly, Secure, SameSite=Lax) + `{ id, email, name }` (HTTP 200)
- **Logout**: Terminates session, returns `{ message: 'Logged out successfully' }` (HTTP 200) + cookie revogado
- **Rate limiting**: 5 req/min per email (sliding window). 429 response with `Retry-After`, `RateLimit-Reset`, `RateLimit-Remaining` headers
- **Account lockout**: After 10 failed attempts from same IP (any window), auto-unlock after 30 min. After 50 total failed attempts across IPs, account locked for all IPs 30 min

### 1.3 Multi-Tenant Membership

- Users can create a new company (becoming first member) or join exclusively via invite token
- `withTenant(tenantId, locationId, userId, fn)` is mandatory entry point for all tenant-scoped queries
- RLS policy: `company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)`

### 1.4 Password & Security

- Passwords hashed by Better Auth (bcrypt, cost factor 10+)
- CORS: explicit allowed origins (no wildcard), `Access-Control-Allow-Credentials: true`
- **FR-025**: If `shared/auth.ts` initialization fails → HTTP 503 with `{ "error": "auth_unavailable", "message": "Authentication service unavailable." }`
- **FR-027**: All unexpected 500 errors → `{ "error": "internal_error", "message": "An unexpected error occurred." }` — no stack traces leaked

### 1.5 Data Governance & LGPD

| Field           | Classification      | Sensitivity | Retention                                      |
| --------------- | ------------------- | ----------- | ---------------------------------------------- |
| email           | Direct identifier   | High        | Indefinite while active, 5y after deactivation |
| name            | Direct identifier   | Medium      | Same as email                                  |
| hashed_password | Auth secret         | High        | Same as email (irreversibly hashed)            |
| CNPJ            | Indirect identifier | Medium      | Indefinite (fiscal record)                     |
| IP address      | Behavioral          | Low         | 90 days (auth logs)                            |
| session_token   | Auth secret         | High        | 24h / 7d (session TTL)                         |

- **Auth logs**: Retained 90 days, then aggregated (counts only) and purged
- **Deactivated accounts**: Data retained 5 years, then permanently anonymized
- **Breach notification**: Detect within 5 min, assess within 2h, notify ANPD within 24h, notify users within 48h

### 1.6 Error Codes

| Code                  | HTTP | When                                          |
| --------------------- | ---- | --------------------------------------------- |
| `validation_error`    | 400  | Body inválido                                 |
| `invalid_credentials` | 401  | Email/senha incorretos                        |
| `unauthorized`        | 401  | Sem sessão válida                             |
| `email_not_verified`  | 403  | Login com email não verificado                |
| `forbidden`           | 403  | Sem permissão / não é owner                   |
| `not_found`           | 404  | Recurso não encontrado (genérico)             |
| `conflict`            | 409  | Unicidade violada (CNPJ, email)               |
| `rate_limit_exceeded` | 429  | 5 req/min email, 20/min IP, 60/min user       |
| `account_locked`      | 429  | 10 falhas (par) ou 50 falhas (global) → 30min |
| `internal_error`      | 500  | Erro inesperado                               |
| `service_unavailable` | 503  | DB/Auth/Email indisponível                    |
| `auth_unavailable`    | 503  | Better Auth falhou ao iniciar                 |
| `upstream_timeout`    | 503  | Timeout chamada externa                       |

All 429 responses include: `Retry-After`, `RateLimit-Reset`, `RateLimit-Remaining` headers.

---

## 2. Core Order (Núcleo Unificado)

### 2.1 Entity `order`

| Campo        | Tipo          | Constraints                                                                              |
| ------------ | ------------- | ---------------------------------------------------------------------------------------- |
| id           | uuid          | PK, default `gen_random_uuid()`                                                          |
| company_id   | uuid          | NOT NULL, FK → company.id                                                                |
| location_id  | uuid          | NOT NULL, FK → location.id                                                               |
| order_type   | text          | NOT NULL, CHECK IN ('dine_in','takeout','delivery','retail_pos','wholesale','quotation') |
| status       | text          | NOT NULL, DEFAULT 'open' — FSM por order_type                                            |
| customer_id  | uuid          | NULLABLE, FK → party.id                                                                  |
| party_id     | uuid          | NULLABLE, FK → party.id (cliente ou fornecedor)                                          |
| total_amount | numeric(12,2) | NOT NULL, DEFAULT 0                                                                      |
| currency     | text          | NOT NULL, DEFAULT 'BRL'                                                                  |
| notes        | text          | NULLABLE                                                                                 |
| created_by   | uuid          | NOT NULL, FK → user.id                                                                   |
| created_at   | timestamptz   | NOT NULL, DEFAULT now()                                                                  |
| updated_at   | timestamptz   | NOT NULL, DEFAULT now()                                                                  |
| closed_at    | timestamptz   | NULLABLE                                                                                 |

### 2.2 Satélites por `order_type`

| order_type | Tabela Satélite  | Campos Extra                                  |
| ---------- | ---------------- | --------------------------------------------- |
| dine_in    | order_dine_in    | table_id, cover_count, waiter_id, opened_at   |
| takeout    | order_takeout    | pickup_at, pickup_name, pickup_phone          |
| delivery   | order_delivery   | address_id, delivery_fee, courier_id, eta     |
| retail_pos | order_retail_pos | register_id, cashier_id, payment_method       |
| wholesale  | order_wholesale  | po_number, payment_terms, shipping_address_id |
| quotation  | order_quotation  | valid_until, approved_by, approved_at         |

### 2.3 FSM por `order_type`

```
stateDiagram-v2
    [*] --> open
    open --> confirmed: confirm()
    open --> cancelled: cancel()
    confirmed --> preparing: start_prep()
    confirmed --> cancelled: cancel()
    preparing --> ready: finish_prep()
    preparing --> cancelled: cancel()
    ready --> completed: close()
    ready --> cancelled: cancel()
    completed --> [*]
    cancelled --> [*]
```

**Transições inválidas = 422** com `{ "error": "invalid_transition", "message": "Cannot transition from X to Y", "details": { "current": "X", "target": "Y" } }`.

### 2.4 RLS

- `company_id` + `location_id` obrigatórios
- Policy: `company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)`

### 2.5 Idempotency

- Criação de `order` **exige** header `Idempotency-Key`

### 2.6 Tabela `order_item`

| Campo            | Tipo          | Constraints                                                                           |
| ---------------- | ------------- | ------------------------------------------------------------------------------------- |
| id               | uuid          | PK                                                                                    |
| order_id         | uuid          | NOT NULL, FK → order.id                                                               |
| product_id       | uuid          | NULLABLE, FK → product.id                                                             |
| product_name     | text          | NOT NULL — snapshot                                                                   |
| unit_price       | numeric(12,2) | NOT NULL — snapshot                                                                   |
| quantity         | numeric(12,3) | NOT NULL                                                                              |
| tax_snapshot     | jsonb         | NOT NULL — alíquota vigente                                                           |
| bom_snapshot     | jsonb         | NULLABLE — ficha técnica                                                              |
| discount_applied | numeric(12,2) | DEFAULT 0 — snapshot                                                                  |
| line_total       | numeric(12,2) | GENERATED ALWAYS AS (round_half_up(unit_price \* quantity - discount_applied)) STORED |
| sort_order       | integer       | DEFAULT 0                                                                             |
| created_at       | timestamptz   | DEFAULT now()                                                                         |

**Snapshot rule**: editar produto não reescreve o passado.

---

## 3. Print (Impressão Operacional — MVP)

### 3.1 Arquitetura Decisões (fechadas)

| Decisão               | Escolha                              | Justificativa                                                                        |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| **Tipo de documento** | Cupom operacional (não-fiscal)       | Atende restaurant pack agora; fiscal = fase 2                                        |
| **Formato**           | ESC/POS bruto (térmica 80mm)         | Universal, offline-native, corte/gaveta native                                       |
| **Render**            | Server-side (Nitro task)             | Gera bytes no worker, envia via TCP/USB/serial; custo zero infra                     |
| **Offline**           | Fila no servidor + retry exponencial | `print_job.status=pending` → worker tenta a cada 30s; botão "Reimprimir" no frontend |
| **Templates**         | Hardcoded por pack (`.ts` no repo)   | Restaurant = `restaurant-print-templates.ts`; mudança = deploy                       |

### 3.2 Escopo MVP

- **Tabelas**: `printer` (driver `escpos`, connection `{type, host, port}`, `station_ids[]`), `print_job` — `content` (ESC/POS bytes base64), `status: pending|printing|completed|failed`, `attempts`
- **Endpoints** (base `/api/v1/print`):
  - `POST /jobs` — Enfileira impressão (idempotente via `Idempotency-Key`)
  - `GET /jobs/:id` — Status do job
  - `GET /jobs?status=pending&printerId=` — Fila por impressora
  - `POST /jobs/:id/retry` — Reimpressão manual

### 3.3 Worker (Nitro task)

- **Estado**: worker não implementado — `server/tasks/process-print-queue.ts` era um stub que enumerava empresas cross-tenant sem contexto de GUC (0 linhas sob `merp_app` desde o `FORCE` de `company`); removido. Dispatch futuro = por tenant via `withTenant`.
- Desenho: pega jobs `pending` + `attempts < 3`, marca `printing`, envia bytes via `net.Socket` (TCP) ou `usb`/`serialport`
- Sucesso → `completed` + `printed_at`; Falha → `attempts++`, `failed` se >= 3

### 3.4 Templates (hardcoded)

- `server/utils/print/templates/restaurant-kitchen-ticket.ts` — KDS: item + estação + quantidade
- `server/utils/print/templates/restaurant-table-comanda.ts` — Mesa: header + itens + total + QR pix

### 3.5 Fora de Escopo

- NFC-e/DANFE/SAT (fiscal) — requer certificado A1, homologação
- HTML/PDF/A4 — não necessário para térmica 80mm
- Template editor no admin / DB — white-label = fase 3

### 3.6 Regras Herdadas

- RLS location-scoped (`company_id` + `location_id`) — ver ADR-002 + `docs/07-reference/database-schema.md`
- Idempotency-Key obrigatório no POST — ver ADR-005 e contrato de `order`
- Snapshot do payload no `print_job.content` — `specs/000-foundation/snapshot.md`

---

## 4. API Contracts Reference

### 4.1 Auth API Endpoints

Base path: `/api/auth`

#### `POST /api/auth/register`

- Body: `{ "email": "string", "password": "string", "consentTermsVersion": "string" }`
- Response 201: `{ "status": true }`
- Erros: `400` (validation), `429` (rate limit), `503` (service unavailable)

#### `POST /api/auth/login`

- Body: `{ "email": "string", "password": "string", "rememberMe": "boolean?" }`
- Response 200: Cookie `merp-session_token` + `{ "status": true }`
- Erros: `401` (invalid_credentials), `403` (email_not_verified), `429`, `503`

#### `POST /api/auth/logout`

- Response 200: `{ "status": true }` + cookie revogado
- Erros: `401` (unauthorized), `503`

#### `GET /api/v1/me`

- Response 200: `{ user, companies, activeCompanyId }`
- Erros: `401`, `403`, `503`

#### `POST /api/v1/companies`

- Body: `{ "name": "string", "cnpj": "string?", "razaoSocial": "string?" }`
- Response 201: Empresa criada + membership owner
- Erros: `400`, `409` (cnpj conflict), `401`, `403`, `503`

#### `POST /api/v1/companies/{companyId}/invitations`

- Body: `{ "email": "string" }`
- Response 201: `{ "token": "string", "expiresAt": "ISO8601" }`
- Erros: `400`, `403` (not owner), `409` (invite pending), `401`, `503`

#### `POST /api/v1/me/invitations/accept`

- Body: `{ "token": "string" }`
- Response 200: `{ "status": true }`
- Erros: `400` (token invalid/expired), `409` (already member), `503`

#### `POST /api/v1/me/deactivate`

- Response 200: `{ "status": true }` + revoga todas sessões
- Erros: `401`, `503`

#### `POST /api/v1/me/consents/withdraw`

- Response 200: `{ "status": true }`
- Erros: `401`, `503`

### 4.2 Error Codes Summary

| Código                | HTTP | Quando                                        |
| --------------------- | ---- | --------------------------------------------- |
| `validation_error`    | 400  | Body inválido                                 |
| `invalid_credentials` | 401  | Email/senha incorretos                        |
| `unauthorized`        | 401  | Sem sessão válida                             |
| `email_not_verified`  | 403  | Login com email não verificado                |
| `forbidden`           | 403  | Sem permissão / não é owner                   |
| `not_found`           | 404  | Recurso não encontrado (genérico)             |
| `conflict`            | 409  | Unicidade violada (CNPJ, email)               |
| `rate_limit_exceeded` | 429  | 5 req/min email, 20/min IP, 60/min user       |
| `account_locked`      | 429  | 10 falhas (par) ou 50 falhas (global) → 30min |
| `weak_password`       | 400  | Senha fraca / HIBP breach                     |
| `token_expired`       | 400  | Token verify/reset/invite expirou             |
| `token_invalid`       | 400  | Token inválido ou já consumido                |
| `internal_error`      | 500  | Erro inesperado                               |
| `service_unavailable` | 503  | DB/Auth/Email indisponível                    |
| `auth_unavailable`    | 503  | Better Auth falhou ao iniciar                 |
| `upstream_timeout`    | 503  | Timeout chamada externa                       |

All 429 responses include: `Retry-After`, `RateLimit-Reset`, `RateLimit-Remaining` headers.

---

## 5. Database Schema Reference

### 5.1 Convenções

| Regra             | Padrão                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| Nomes de tabela   | Singular, snake_case (`company`, `company_member`)                     |
| Nomes de coluna   | snake_case (`company_id`, `created_at`)                                |
| PK                | `uuid` via `gen_random_uuid()` (tipo `text`)                           |
| FK                | `text` referenciando PK `text`                                         |
| `company_id`      | `text NOT NULL` em **todas** tabelas tenant-scoped                     |
| Money             | `numeric(12,2)` + arredondamento half-up no servidor (ADR-003)         |
| Timestamps        | `timestamp with time zone DEFAULT now()`                               |
| Soft delete       | `is_deleted boolean DEFAULT false` ou `is_active boolean DEFAULT true` |
| Índices padrão    | `(company_id, created_at)` em entidades de movimento                   |
| UNIQUE de negócio | Sempre composto: `(company_id, campo)`                                 |

### 5.2 Tabelas Core (Auth)

| Tabela                | Descrição                                                                       | RLS             |
| --------------------- | ------------------------------------------------------------------------------- | --------------- |
| `user`                | Usuário global (email, name, password hash)                                     | Não (global)    |
| `session`             | Sessão ativa (token, expires_at, active_company_id)                             | Não (global)    |
| `account`             | OAuth accounts (não usado ainda)                                                | Não             |
| `verification`        | Tokens de email/password reset                                                  | Não             |
| `auth_event`          | Audit log de eventos auth                                                       | Sim (`user_id`) |
| `auth_security_state` | Rate limiting / lockout state                                                   | Não             |
| `email_queue`         | Resíduo da fila removida — tabela existe (migração `0019`), nenhum código a usa | Não             |

### 5.3 Tabelas Tenant (Multi-tenancy)

| Tabela           | Descrição                              | RLS                   |
| ---------------- | -------------------------------------- | --------------------- |
| `company`        | Tenant raiz (name, cnpj, razao_social) | Sim (company_id = id) |
| `company_member` | Users ↔ Companies (role: owner/member) | Sim                   |
| `invite`         | Convites para entrar na company        | Sim                   |

### 5.4 Migrações

- **Journal (14)**: `drizzle/meta/_journal.json` — aplicadas via `drizzle-kit migrate`
- **Custom (10+)**: `drizzle/0014_*.sql` em diante — RLS, policies, grants, DEFAULT PRIVILEGES
- **Aplicação**: `npm run db:migrate:full` roda ambos (ver `scripts/apply-custom-sql.ts`)

### 5.5 Grants merp_app

- Migration 0017: grants explícitos nas tabelas existentes
- Migration 0020: `ALTER DEFAULT PRIVILEGES` para tabelas/sequences futuras
- Teste: `grants-parity.test.ts` bloqueia CI se faltar grant

---

## 6. Consolidated Success Criteria

- **SC-001**: Registration completes in under 2 seconds (p95)
- **SC-002**: Login completes in under 1 second (p95)
- **SC-003**: Session validation (authenticated request overhead) is under 100ms (p95)
- **SC-004**: Duplicate registration returns an error in under 500ms
- **SC-005**: Unauthenticated requests return an access-denied response in under 50ms
- **SC-006**: a 6ª requisição no window de 60s (por email) retorna 429 com header `Retry-After`

---

_Consolidated from: specs/001-auth-context, specs/006-core-order, specs/007-print, docs/04-api/auth-api.md, docs/07-reference/database-schema.md_
_Last updated: 2026-10-04_

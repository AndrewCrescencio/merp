# Backend Analysis — Restaurant/Pizzeria Management System

## Executive Summary

**Yes, this codebase can be adapted** for a restaurant/pizzeria management system. The existing multi-tenant auth foundation (companies, invitations, RLS, audit) maps directly to "restaurant groups" or "franchise locations." You'll add domain modules (menu, orders, kitchen, inventory) on top.

---

## 1. Current Backend Capabilities (Implemented & Functional)

### 1.1 Authentication & Identity (`server/utils/auth/identity/`, `server/api/auth/*.ts`)

| Feature                         | Implementation Details                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Email/password registration** | Consent terms version (LGPD), HIBP breach check, weak password deny-list, anti-enumeration (identical 201 for new/existing email)                   |
| **Email/password login**        | Timing-safe for deactivated accounts (AUD-07), session fixation protection (revokes other sessions), fixed 7d session TTL (FR-009)                  |
| **Email verification**          | Sent on sign-up & sign-in (`requireEmailVerification`), JWT token TTL 1h, idempotent verify                                                         |
| **Password reset ("forget")**   | Anti-enumeration (generic response), token TTL 1h, revokes all sessions on reset                                                                    |
| **Password reset (set new)**    | Validates token, HIBP check, weak password check, revokes sessions                                                                                  |
| **Logout**                      | Revokes session cookie, emits `session_invalidated` + `logout` audit events                                                                         |
| **Session management**          | Sliding window rate limits (IP/email/user), lockout (pair + global tiers), audit events for `session_validated`/`session_expired`/`session_created` |
| **2FA (TOTP + backup codes)**   | Via `better-auth/plugins/twoFactor`, issuer `merp`, 6-digit/30s, 10 backup codes, trust device 30d                                                  |
| **Consent withdrawal**          | Immediate deactivation + session termination, `consent_withdrawal` audit event                                                                      |
| **Account deactivation**        | Sets `isActive=false`, terminates sessions, sends deactivation notice email                                                                         |
| **Session export (GDPR)**       | `/api/auth/export` endpoint (profile, companies, sessions, auth events)                                                                             |

### 1.2 Multi-Tenancy / Companies (`server/utils/auth/company/`, `server/api/auth/companies*.ts`)

| Feature                   | Implementation Details                                                         |
| ------------------------- | ------------------------------------------------------------------------------ |
| **Create company**        | Owner bootstrap, CNPJ/razão social optional, RLS policies enforced             |
| **List user's companies** | Scoped to membership (AUD-10)                                                  |
| **Search companies**      | Scoped to membership, LIKE on name/CNPJ                                        |
| **Switch active company** | Validates membership in same transaction, updates `session.activeCompanyId`    |
| **Update company**        | Owner-only, CNPJ uniqueness                                                    |
| **Soft-delete company**   | Marks `isDeleted`, removes all members, clears `activeCompanyId` from sessions |
| **Remove member**         | Owner removes any member; member can self-remove (not owner), clears sessions  |

### 1.3 Invitations (`server/utils/auth/invite/`, `server/api/auth/invite*.ts`)

| Feature                         | Implementation Details                                                 |
| ------------------------------- | ---------------------------------------------------------------------- |
| **Create invite (owner only)**  | 256-bit token returned once, SHA-256 hash stored, 7-day TTL            |
| **Accept invite (token-based)** | Validates token+email, claims invite, creates membership, RLS-enforced |
| **List company invites**        | Owner-only (via RLS)                                                   |

### 1.4 Security & Infrastructure

| Feature                             | Implementation Details                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Rate limiting (sliding window)**  | IP (20/min), email (5/min), user (60/min) — `server/utils/shared/security.ts`                                |
| **Account lockout (dual-tier)**     | Pair (email+IP, 10 attempts) + global (email, 50 attempts), 30-min lock                                      |
| **HIBP breach check (k-anonymity)** | On register & reset-password — `server/utils/shared/hibp.ts`                                                 |
| **CSRF protection**                 | Double-submit cookie pattern — `server/middleware/01-csrf-token.ts`, `02-csrf-validate.ts`                   |
| **PII audit logging**               | All auth events to `auth_event` table — `server/utils/shared/audit.ts`                                       |
| **Email queue (Resend)**            | Async queue with retry/backoff — `server/utils/shared/email.ts`, `server/tasks/process-email-queue.ts`       |
| **Scheduled cleanup tasks**         | Purge sessions, security state, auth events (daily); process email queue (5min) — `nitro.scheduledTasks`     |
| **RLS policies (PostgreSQL)**       | 20 migration files in `drizzle/` (14 journaled per `_journal.json` + 6 RLS/policy via `apply-custom-sql.ts`) |

---

## 2. Database Schema (Current)

### Core Tables (from migrations)

```sql
-- Identity (Better Auth standard + extensions)
user              -- id, name, email, email_verified, image, is_active, consent_*, two_factor_enabled
session           -- id, user_id, token, expires_at, ip_address, user_agent, remember_me, active_company_id
account           -- OAuth accounts (not yet used)
verification      -- Email verification & password reset tokens
auth_event        -- Audit log (user_id, email, event_type, ip, metadata, created_at)

-- Multi-tenancy
company           -- id, name, cnpj, razao_social, is_deleted
company_member    -- id, company_id, user_id, role ('owner'|'member')

-- Invitations
invite            -- id, company_id, email, invited_by, token_hash, accepted_at, expires_at

-- Security
auth_security_state -- key (rate:/lockout:), count, locked_until, window (JSONB timestamps), reset_at

-- Email
email_queue       -- id, to, subject, html, attempts, max_attempts, status, scheduled_at, sent_at

-- 2FA
two_factor        -- id, secret, backup_codes, user_id
```

### RLS Policy Highlights

| Table                 | Key Policies                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `company`             | SELECT: tenant context OR membership; UPDATE/DELETE: tenant + owner                                                       |
| `company_member`      | SELECT: tenant OR own user_id; INSERT: owner bootstrap OR member bootstrap OR invite token; UPDATE/DELETE: tenant + owner |
| `invite`              | SELECT: tenant OR valid token_hash; INSERT: owner; UPDATE: owner OR token claim; DELETE: owner                            |
| `auth_security_state` | App role `merp_app` has full DML (rate limit/lockout)                                                                     |
| `email_queue`         | App role `merp_app` has full DML                                                                                          |

---

## 3. API Endpoints (Current)

### Auth

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/forget-password
POST   /api/auth/reset-password
GET    /api/auth/reset-password/[token]   (validate token)
GET    /api/auth/verify-email
POST   /api/auth/send-verification-email
POST   /api/auth/deactivate
POST   /api/auth/consent/withdraw
GET    /api/auth/export
```

### Companies

```
POST   /api/auth/companies
GET    /api/auth/companies?q=<search>
POST   /api/auth/companies/switch
POST   /api/auth/companies/update
POST   /api/auth/companies/delete
```

### Invitations

```
POST   /api/auth/invite
GET    /api/auth/invites
POST   /api/auth/invites/accept
```

### Members

```
POST   /api/auth/companies/members/delete
```

### Health / Misc

```
GET    /api/health
GET    /api/metrics                        (Prometheus, no PII)
GET    /api/.well-known/security.txt
```

---

## 4. Gaps for Restaurant/Pizzeria System

### 4.1 Domain Modules Needed (Not Implemented)

| Module                   | Required Entities                                                            | Notes                                                          |
| ------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Menu / Cardápio**      | `category`, `product`, `product_variant`, `ingredient`, `product_ingredient` | Multi-tenant (scoped to company)                               |
| **Orders / Pedidos**     | `order`, `order_item`, `order_status_history`, `payment`                     | Status flow: pending → preparing → ready → delivered/cancelled |
| **Kitchen / Produção**   | `kitchen_ticket`, `station`, `prep_time_estimate`                            | Real-time via WebSocket/SSE                                    |
| **Tables / Mesas**       | `table`, `table_session`, `qr_code`                                          | For dine-in                                                    |
| **Delivery**             | `delivery_zone`, `driver`, `delivery_order`                                  | Integration with iFood/Rappi optional                          |
| **Inventory / Estoque**  | `stock_item`, `stock_movement`, `supplier`, `purchase_order`                 | Low-stock alerts                                               |
| **Customers / Clientes** | `customer`, `customer_address`, `loyalty_points`                             | CRM lite                                                       |
| **Reports / Relatórios** | Materialized views or scheduled aggregates                                   | Sales, top products, peak hours                                |

### 4.2 Auth Extensions Needed

| Feature                                 | Status     | Effort                                  |
| --------------------------------------- | ---------- | --------------------------------------- |
| OAuth providers (Google, Apple)         | ❌         | Low — add to `better-auth` plugins      |
| Passkeys / WebAuthn                     | ❌         | Medium — Better Auth plugin exists      |
| Roles beyond owner/member               | ❌         | Low — extend `company_member.role` enum |
| Staff roles (kitchen, cashier, manager) | ❌         | Low — new role values + RLS policies    |
| API keys for POS/kiosk integration      | ❌         | Medium — new table + auth middleware    |
| Device/session listing API              | ⚠️ Partial | Low — expose existing `getUserSessions` |

### 4.3 Infrastructure Gaps

| Area                         | Gap                                                                        |
| ---------------------------- | -------------------------------------------------------------------------- |
| **Real-time**                | No WebSocket/SSE infrastructure (needed for kitchen tickets, order status) |
| **File upload**              | No image storage for product photos (need S3/R2 + signed URLs)             |
| **Search**                   | No full-text search (PostgreSQL `tsvector` or MeiliSearch/Typesense)       |
| **Background jobs**          | Only email queue; need order processing, report generation, stock alerts   |
| **Webhooks**                 | No outbound webhook system (for iFood, payment gateways, loyalty)          |
| **Multi-location inventory** | Current schema assumes single company = single location                    |

---

## 5. Adaptation Roadmap

### Phase 1: Schema Extensions (Week 1-2)

```typescript
// server/utils/schema/restaurant.ts (new)
export const category = pgTable('category', { ... })
export const product = pgTable('product', {
  companyId: text().references(() => company.id),  // tenant-scoped
  ...
})
export const productVariant = pgTable('product_variant', { ... })
export const ingredient = pgTable('ingredient', { ... })
export const productIngredient = pgTable('product_ingredient', { ... })

// server/utils/schema/orders.ts (new)
export const order = pgTable('order', {
  companyId: text().references(() => company.id),
  customerId: text().references(() => customer.id),
  tableId: text().references(() => table.id),
  status: text().default('pending'), // pending, preparing, ready, delivered, cancelled
  type: text().default('dine_in'),   // dine_in, takeaway, delivery
  total: integer(),                   // cents
  ...
})
export const orderItem = pgTable('order_item', { ... })
```

### Phase 2: Repository Layer (Week 2-3)

- Create `server/utils/auth/restaurant/repository.ts` pattern matching existing repos
- Implement RLS policies for new tables (tenant-scoped via `company_id`)
- Add migrations in `drizzle/`

### Phase 3: API Endpoints (Week 3-4)

```
# Menu
GET    /api/restaurant/categories
POST   /api/restaurant/categories
GET    /api/restaurant/products
POST   /api/restaurant/products
GET    /api/restaurant/products/:id
PATCH  /api/restaurant/products/:id
DELETE /api/restaurant/products/:id

# Orders
POST   /api/restaurant/orders
GET    /api/restaurant/orders
GET    /api/restaurant/orders/:id
PATCH  /api/restaurant/orders/:id/status
GET    /api/restaurant/orders/:id/ticket

# Kitchen (SSE/WebSocket)
GET    /api/restaurant/kitchen/tickets/stream
POST   /api/restaurant/kitchen/tickets/:id/start
POST   /api/restaurant/kitchen/tickets/:id/complete

# Tables
GET    /api/restaurant/tables
POST   /api/restaurant/tables
POST   /api/restaurant/tables/:id/session
DELETE /api/restaurant/tables/:id/session
```

### Phase 4: Real-time & Integrations (Week 4-5)

- Add `socket.io` or native WebSocket via Nitro
- Kitchen ticket SSE stream
- Order status push to customer
- iFood/Rappi webhook receivers
- Payment gateway (Mercado Pago, Stripe) webhooks

### Phase 5: Reports & Admin (Week 5-6)

- Materialized views for sales reports
- Scheduled aggregation tasks
- Admin dashboard API (cross-company; requires a platform role — no `super_admin` exists yet)

---

## 6. Technical Debt to Address

1. **RLS migrations split in two flows** — `drizzle/meta/_journal.json` covers 14
   migrations (`drizzle-kit migrate` / `make migrate`); 6 RLS/policy files
   (≥ `0014`, incl. `0014_bootstrap_role_split`, `0016_company_select_membership`,
   `0017_app_role_core_grants`, `0018_consolidated_auth_security_state`,
   `0019_consolidated_email_two_factor`, `0014_app_role_ensure`) are outside the journal
   and applied only by the idempotent applier `server/utils/apply-custom-sql.ts` (test setup).
   A fresh DB via `make migrate` alone boots **without RLS policies** — see README runbook.
   Fix before any deploy with real data (e.g. a `make migrate-full`).
2. **Integration tests use a real DB** — `*.test.ts` beside repositories run against
   PostgreSQL (no testcontainers); document the required `DATABASE_URL` for CI.
3. **Serverless/edge caveats (partially addressed)** — fire-and-forget audit/email
   now goes through `background(event, promise)` (`server/utils/shared/background.ts`),
   which uses `event.waitUntil` when the runtime provides it; pure `void` calls
   without an event (Better Auth email callbacks) remain Node-only.
4. **Resend optional** — Make email config required or add fallback (nodemailer)
5. **Backup codes regeneration** — Add `/api/auth/2fa/backup-codes/regenerate`
6. **No API versioning (deferred)** — no `/api/v1/` prefix until the first public
   API consumer exists; see `specs/001-auth-context/contracts/auth-api.md`.

---

## 7. File Structure for New Modules

```
server/
├── utils/
│   ├── schema/
│   │   ├── restaurant.ts      # NEW: menu, ingredients
│   │   ├── orders.ts          # NEW: orders, items, payments
│   │   ├── kitchen.ts         # NEW: tickets, stations
│   │   ├── tables.ts          # NEW: tables, sessions
│   │   ├── inventory.ts       # NEW: stock, suppliers
│   │   ├── customers.ts       # NEW: customers, loyalty
│   │   └── index.ts           # UPDATE: export new schemas
│   ├── auth/
│   │   ├── restaurant/
│   │   │   ├── repository.ts
│   │   │   ├── repository.spec.ts
│   │   │   └── repository.test.ts
│   │   ├── orders/
│   │   ├── kitchen/
│   │   ├── tables/
│   │   ├── inventory/
│   │   └── customers/
│   └── shared/
│       ├── websocket.ts       # NEW: WS/SSE helpers
│       ├── webhooks.ts        # NEW: inbound/outbound webhooks
│       └── reports.ts         # NEW: aggregation queries
├── api/
│   └── restaurant/            # NEW: all domain endpoints
│       ├── categories/
│       ├── products/
│       ├── orders/
│       ├── kitchen/
│       ├── tables/
│       ├── inventory/
│       └── customers/
└── tasks/
    ├── process-orders.ts      # NEW: order timeout, auto-cancel
    ├── generate-reports.ts    # NEW: daily/weekly aggregates
    └── check-stock.ts         # NEW: low-stock alerts
```

---

## 8. Frontend (Separate — To Be Built)

> **Not included in this backend analysis.** Current state: only `app/app.vue` exists. Will need:

- Nuxt 4 pages/layouts/components for all modules
- Composables: `useAuth`, `useCompany`, `useMenu`, `useOrders`, `useKitchen`, `useTables`
- Pinia stores for client-side state
- Type-safe API client (generated from OpenAPI or manual)
- Real-time components (SSE/WebSocket) for kitchen/customer order tracking

---

## 9. Decision Points for You

| Question                                           | Recommendation                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Single location vs multi-location per company?** | Current `company` = restaurant group; add `location` table under company for multi-unit |
| **Self-hosted or SaaS?**                           | Current RLS + multi-tenant = SaaS-ready; add super-admin role for platform ops          |
| **POS integration needed?**                        | Build API keys + webhook endpoints early                                                |
| **iFood/Rappi integration?**                       | Add webhook receivers + order normalization layer                                       |
| **Offline-first kitchen?**                         | Consider local SQLite sync (complex); start with online SSE                             |

---

## 10. Quick Start Commands

```bash
# 1. Apply existing migrations (if fresh DB)
pnpm drizzle-kit migrate

# 2. Generate new migration for restaurant schema
pnpm drizzle-kit generate --name restaurant_schema

# 3. Run dev server
pnpm dev

# 4. Run tests
pnpm test

# 5. Type-check
pnpm lint
```

---

_Generated from codebase analysis on 2026-09-21. Source: `/home/o/Work/merp` (HEAD `adc9a46`)_

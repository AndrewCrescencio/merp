# ERP Feature Implementation Plan

## Overview

This document plans the ERP (Enterprise Resource Planning) feature implementation for the **merp** application. The repository already has a **production-ready SaaS authentication + multi-tenant foundation** built with Nuxt 4, Better Auth, Drizzle ORM, and PostgreSQL.

The existing system handles:

- User authentication (email/password, 2FA, verification, password reset)
- Company/tenant isolation with RLS policies
- Rate limiting, CSRF protection, security headers
- Audit logging of all auth events
- Scheduled tasks (email queue, session/purge cleanup)

This plan covers building **ERP-specific features** on top of this foundation.

---

## 1. Current Foundation Assessment

### ✅ Already Complete (SaaS Base)

| Layer                    | Implementation                                                                                              | Status              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------- |
| **Authentication**       | better-auth with email/password, 2FA (TOTP), verification, password reset                                   | ✅ Production ready |
| **Multi-tenancy**        | `company` + `company_member` tables, RLS policies via `tenant-context.ts`                                   | ✅ Complete         |
| **Authentication flows** | Sign up, login, email verification, password reset, deactivate, session management                          | ✅ Complete         |
| **Security**             | Rate limiting (sliding window per email/IP/user), CSRF double-submit, nginx security headers, audit logging | ✅ Complete         |
| **Middleware pipeline**  | `00-no-store` → `01-csrf-token` → `02-csrf-validate` → `auth.ts`                                            | ✅ Complete         |
| **Test coverage**        | 364 tests across 44 files (38 unit passed + 6 skipped, 291 passed + 73 integration gated)                   | ✅ Good coverage    |
| **Scheduled tasks**      | Email queue, session purge, security state purge, email processing                                          | ✅ Complete         |

### 📁 Key Files (SaaS Foundation)

- `shared/auth.ts` - Better Auth configuration
- `server/utils/auth/identity/repository.ts` - Auth repository (signIn, register, etc.)
- `server/utils/auth/company/repository.ts` - Company management
- `server/utils/auth/tenant-context.ts` - Per-tenant DB context
- `server/middleware/` - CSRF + no-store middleware
- `server/utils/shared/security.ts` - Rate limiting, lockout, password validation
- `server/middleware/00-no-store.ts` - PII no-store header middleware
- `drizzle/0018_consolidated_auth_security_state.sql` - Security state table

---

## 2. ERP Modules to Implement (ASPIRACIONAL — Not Implemented)

> ⚠️ **This entire section describes planned features that do not exist in the codebase.** No ERP tables, endpoints, or repositories have been created yet. The SQL in §3 is **pseudo-DDL for design discussion only** — not valid PostgreSQL (uses `status 'a' | 'b'` syntax). Convert to Drizzle schema in `server/utils/schema/<domain>.ts` and generate migrations via `drizzle-kit generate`.

The following ERP modules are **not yet implemented** and need to be built. Priority order reflects typical ERP deployment sequence.

### Phase 1: Core Module (Essential for any ERP)

> Detalhamento: `specs/003-erp-catalog/plan.md` (produtos/estoque) e `specs/006-erp-crm/plan.md` (clientes base).

| Module               | Description                                                | Key Entities                                    |
| -------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| **Products/Catalog** | Product inventory management with categories, SKU, pricing | `product`, `category`, `product_image`          |
| **Inventory**        | Stock tracking, warehouse locations, stock movements       | `stock_quantity`, `stock_movement`, `warehouse` |

### Phase 2: Sales & Procurement

> Detalhamento: `specs/004-erp-sales/plan.md`.

| Module              | Description                                   | Key Entities                                      |
| ------------------- | --------------------------------------------- | ------------------------------------------------- |
| **Sales Orders**    | Customer order flow from quote to fulfillment | `sales_order`, `sales_order_item`, `customer`     |
| **Purchase Orders** | Vendor order management                       | `purchase_order`, `purchase_order_item`, `vendor` |

### Phase 3: Finance & Accounting

> Detalhamento: `specs/005-erp-finance/plan.md`.

| Module        | Description                                         | Key Entities                            |
| ------------- | --------------------------------------------------- | --------------------------------------- |
| **Invoicing** | Generate invoices, track payments, partial payments | `invoice`, `invoice_line`, `payment`    |
| **Payments**  | Payment method tracking, reconciliation             | `payment_method`, `payment_transaction` |

### Phase 4: CRM & Relations

> Detalhamento: `specs/006-erp-crm/plan.md`.

| Module        | Description                                  | Key Entities                 |
| ------------- | -------------------------------------------- | ---------------------------- |
| **Customers** | Customer profile, contact info, segmentation | `customer`, `contact_person` |
| **Vendors**   | Vendor profile, contracts, performance       | `vendor`, `vendor_contact`   |

### Phase 5: Reporting & Administration

> Detalhamento: `specs/007-erp-admin/plan.md`.

| Module            | Description                         | Key Entities                      |
| ----------------- | ----------------------------------- | --------------------------------- |
| **Users & Roles** | User management within companies    | `user`, `user_role`, `permission` |
| **Settings**      | Company configuration, integrations | `setting`, `integration`          |

---

## 3. Database Schema Extensions

> ⚠️ **The SQL below is DESIGN-ONLY pseudo-DDL — NOT valid PostgreSQL and NOT runnable.**
>
> - `status 'active' | 'inactive'` syntax is invalid (use `text` + `CHECK` constraint)
> - `payment_method 'credit_card' | 'bank_transfer' | ...` syntax is invalid
> - Duplicated `sales_order_item` definition (§3.2) needs resolution
> - **No ERP tables exist in the codebase** — this is a design proposal only
> - Convert to Drizzle schema in `server/utils/schema/<domain>.ts` and generate migrations via `drizzle-kit generate`

### Existing Tables (Keep/Extend)

| Table                 | Current Purpose             | ERP Extensions Needed                         |
| --------------------- | --------------------------- | --------------------------------------------- |
| `user`                | Auth user + profile         | Add `company_id` FK (already present via RLS) |
| `company`             | Tenant/organization         | Add `subscription_plan`, `status`             |
| `company_member`      | Users ↔ Companies mapping   | Add `is_active`, `invited_by`                 |
| `session`             | User sessions               | Extend with `last_activity_at`                |
| `auth_security_state` | Rate limiting/lockout       | Keep as-is (shared across tenant)             |
| `verification`        | Email/password reset tokens | Keep as-is                                    |

### New Tables Required

#### 3.1 Products & Inventory

> Movido para `specs/003-erp-catalog/plan.md` (DDL + notas de tenant/RLS).
> Regra: tabelas novas entram em `server/utils/schema/<domínio>.ts` +
> `drizzle-kit generate` — nunca SQL avulso (ver aviso no Sprint 0).

#### 3.2 Sales & Procurement

> Movido: sales orders → `specs/004-erp-sales/plan.md`; customers/vendors →
> `specs/006-erp-crm/plan.md`.

#### 3.3 Finance

> Movido para `specs/005-erp-finance/plan.md` (DDL + idempotência do `pay` + decisão de gateway).

#### 3.4 CRM

> Movido para `specs/006-erp-crm/plan.md` (inclui validação CNPJ/CPF e notas de PII).

---

## 4. API Endpoint Patterns

### Authentication (Already Implemented - Reference)

| Endpoint                            | Method | Description                                   |
| ----------------------------------- | ------ | --------------------------------------------- |
| `/api/auth/register`                | POST   | Register new user                             |
| `/api/auth/login`                   | POST   | Login with email/password                     |
| `/api/auth/verify-email`            | GET    | Verify email with token                       |
| `/api/auth/reset-password`          | POST   | Request password reset link                   |
| `/api/auth/reset-password/[token]`  | GET    | Validate reset token                          |
| `/api/auth/forget-password`         | POST   | Request password reset (anti-enumération)     |
| `/api/auth/logout`                  | POST   | Logout and revoke sessions                    |
| `/api/auth/me`                      | GET    | Current user profile                          |
| `/api/auth/send-verification-email` | POST   | Resend verification email                     |
| `/api/auth/two-factor/*`            | \*     | Better Auth plugin routes (no custom handler) |

### ERP API Patterns (To Be Created)

All ERP endpoints **require authentication** (middleware `auth.ts`) and **company isolation** (via `event.context.tenantId`).

#### 4.1 Products API

> Movido para `specs/003-erp-catalog/plan.md`.

#### 4.2 Customers API

> Movido para `specs/006-erp-crm/plan.md`.

#### 4.3 Sales Orders API

> Movido para `specs/004-erp-sales/plan.md`.

#### 4.4 Invoices API

> Movido para `specs/005-erp-finance/plan.md`.

#### 4.5 Shared Patterns

All responses follow this contract (defined in `server/utils/shared/errors.ts`):

```typescript
interface ApiError {
  error: string // error code (e.g., 'validation_error', 'not_found')
  message: string // human-readable message
}
```

Error handling via `error-handler.ts` normalizes all errors to JSON contract with proper status codes.

**Rate limiting** applies per-company via `checkUserRateLimit(event, session.user.id)` in auth middleware.

**CSRF protection** applies to all POST/PUT/PATCHDELETE endpoints except auth routes (exempt listed in `csrf.ts`).

**PII no-store** header applied to all `/api/` routes via `00-no-store.ts` middleware.

---

## 5. Authentication & Authorization Flows

### 5.1 User Onboarding to ERP

1. **User signs up** → `/api/auth/register` → Better Auth creates user + sends verification
2. **Email verified** → User can login
3. **First login** → `auth.ts` middleware validates session
4. **Company creation** → POST `/api/auth/companies` (already implemented in `companies.post.ts`)
5. **User becomes company owner** → Automatically added to `company_member` with `role=owner`

### 5.2 ERP Feature Access Control

Access control follows **two layers**:

#### Layer 1: Authentication (HTTP-Level)

- All `/api/` routes protected by `auth.ts` middleware
- 401 if no valid session
- 503 if Better Auth not initialized
- CSRF token required for state-changing requests

#### Layer 2: Authorization (Business-Level)

- **Company isolation**: Every DB query must filter by `company_id`
- **Role-based access**: Users have roles within their company
- **Resource ownership**: Records belong to a company; users can only access their company's data

**Example query pattern** (in repositories):

```typescript
// Before any query:
const tenantId = event.context.tenantId as string // from auth middleware

// Then in Drizzle select:
const [product] = await db
  .select()
  .from(product)
  .where(
    and(
      eq(product.id, productId),
      eq(product.company_id, tenantId), // ← Critical security
    ),
  )
```

### 5.3 Permission Matrix (ASPIRACIONAL — Not Implemented)

> ⚠️ **Current code only has `owner` | `member` roles** (`server/utils/schema/company.ts:37`). The matrix below is a design proposal for future ERP roles.

| Role        | Products   | Customers  | Sales Orders | Invoices       | Reports     |
| ----------- | ---------- | ---------- | ------------ | -------------- | ----------- |
| **Owner**   | Full CRUD  | Full CRUD  | Full CRUD    | Full CRUD      | Full access |
| **Manager** | Full CRUD  | Read/write | Full CRUD    | Create/see own | Read-only   |
| **Staff**   | Create own | Create own | Create own   | Create own     | None        |
| **Viewer**  | Read-only  | Read-only  | Read-only    | Read-only      | Read-only   |

_(Design this matrix early - drives RLS policies and API route protection. Requires extending `company_member.role` + new RLS policies.)_

---

## 6. Security Considerations (ERP-Specific)

### 6.1 Data Isolation

- **Per-company RLS**: All tables must have `company_id` column and filter by it
- **No cross-company data leakage**: Verify every query has `company_id` filter
- **Database-level RLS**: Use PostgreSQL Row Level Security (refer to existing `drizzle/0015_app_role_grants.sql` patterns)

### 6.2 Rate Limiting

- Existing: 5 requests/min per email (login/register), 20/min per IP, 60/min per user
- ERP addition: Consider per-company limits for heavy usage endpoints
- **Pattern**: `rate:company:${companyId}` for ERP-specific rate limiting if needed

### 6.3 Input Validation

- All ERP endpoints use Zod-like validation through manual checks (existing pattern)
- **Critical**: Validate numeric ranges (prices, quantities, dates)
- **Critical**: Sanitize text fields to prevent XSS in reports/emails
- Use existing `isWeakPassword`, `EMAIL_REGEX`, `MAX_*` constants from `security.ts`

### 6.4 Audit Logging

- Existing: `createAuthEvent()` fire-and-forget pattern
- **ERP addition**: Log critical business events
  - `product.created`, `product.deleted`
  - `customer.created`, `customer.deleted`
  - `sales_order.created`, `sales_order.cancelled`
  - `invoice.created`, `invoice.paid`, `invoice.refunded`
  - `user.role_changed`, `company.updated`

### 6.5 CSRF & CORS

- CSRF already configured for all `/api/` routes
- CORS configured via `CORS_ORIGIN` env var (must match `better-auth` `trustedOrigins`)
- **ERP**: If exposing public API, document CORS requirements

### 6.6 XSS & Injection Prevention

- Use `normalizeEmail()` for all email fields
- Parameterized queries via Drizzle (already used - no raw SQL in routes)
- Escape output in Vue templates (`v-html` avoided or sanitized)
- Content Security Policy already set in nginx

---

## 7. Testing Strategy

### 7.1 Existing Test Patterns (Follow These)

```
server/api/auth/              → .spec.ts files (unit tests, no DB)
server/utils/auth/            → .test.ts files (integration, real DB mock)
server/utils/shared/          → .spec.ts files (utility functions)
vitest.config.ts              → Test environment config
```

### 7.2 ERP Test Categories

| Category          | Example                                                    | Test Type                                |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------- |
| **Unit**          | `isWeakPassword()`, `normalizeEmail()`                     | `vitest run` fast feedback               |
| **Repository**    | `findByEmail()`, `createCompanyWithOwner()`                | Integration with db mock                 |
| **API endpoints** | `GET /api/products`, `POST /invoices`                      | Vitest + @nuxt/test-utils (repo pattern) |
| **Integration**   | Full user flow: register → create company → create product | End-to-end                               |
| **Security**      | Rate limit breach, CSRF failure, RLS bypass                | Security test suite                      |

### 7.3 Test Data Factories

Create reusable test fixtures:

```typescript
// Example: test-setup.ts pattern
const testUser = {
  id: 'user-123',
  email: 'test@merp.com',
  name: 'Test User',
  companyId: 'company-1',
}

// Factory for products
const testProduct = (overrides = {}) => ({
  id: 'prod-1',
  name: 'Test Product',
  sku: 'TP-001',
  price: 99.99,
  ...overrides,
})
```

### 7.4 CI/CD Considerations

- All ERP tests must pass on `pnpm test`
- Lint must pass on `pnpm lint`
- Typecheck via `nuxt build` (fails on type errors)
- Docker compose for integration tests (skip if no Docker available - as current setup)

---

## 8. Implementation Roadmap

### Sprint 0: Foundation (1 week)

| Task                                                   | Owner    | Deliverable                                                    |
| ------------------------------------------------------ | -------- | -------------------------------------------------------------- |
| Set up Drizzle schema migrations for new tables        | Lead Dev | Migration files `0020_products.sql`, `0021_category.sql`, etc. |
| Create base repository patterns                        | Lead Dev | `products.repository.ts`, `customers.repository.ts`, etc.      |
| Add company_id to all new tables + RLS policies        | Dev      | Updated drizzle migrations                                     |
| Update auth middleware with ERP-specific rate limiting | Dev      | `security.ts` additions                                        |
| Write foundational tests                               | QA       | Product/customer/repository tests                              |

> ⚠️ Migration flow (repo reality): `drizzle-kit migrate` / `make migrate`
> applies **only** the 14 journaled migrations (`drizzle/meta/_journal.json`).
> Do NOT hand-write `drizzle/0020_*.sql` files — they would be silently
> ignored. New tables go in `server/utils/schema/<domain>.ts` +
> `drizzle-kit generate` (which journals them); RLS/policy SQL outside the
> journal goes through `server/utils/apply-custom-sql.ts`. See README runbook
> ("Banco novo do zero").

### Sprint 1: Core ERP (2 weeks)

| Task                                  | Owner | Deliverable                                          |
| ------------------------------------- | ----- | ---------------------------------------------------- |
| Product CRUD API + inventory tracking | Dev   | `GET/POST/PUT/DELETE /api/products`                  |
| Customer & Vendor CRUD                | Dev   | `GET/POST/PUT/DELETE /api/customers`, `/api/vendors` |
| Contact person management             | Dev   | Contact person API under customers                   |
| Unit + repository tests               | QA    | 50+ test assertions                                  |

### Sprint 2: Sales & Procurement (2 weeks)

| Task                                                       | Owner | Deliverable                                   |
| ---------------------------------------------------------- | ----- | --------------------------------------------- |
| Sales Order flow (draft → confirmed → shipped → delivered) | Dev   | Full sales order API                          |
| Sales Order item management                                | Dev   | Add/remove items, price adjustment            |
| Purchase Order basic CRUD                                  | Dev   | `GET/POST/PUT /api/purchase-orders`           |
| Integration tests (end-to-end flows)                       | QA    | Place order → create invoice → record payment |

### Sprint 3: Finance & Invoicing (2 weeks)

| Task                                                    | Owner | Deliverable                                   |
| ------------------------------------------------------- | ----- | --------------------------------------------- |
| Invoice generation (from sales order or standalone)     | Dev   | `POST /api/invoices`                          |
| Invoice line items                                      | Dev   | Add line items, taxes, discounts              |
| Payment recording & reconciliation                      | Dev   | `POST /api/invoices/[id]/pay`                 |
| Payment methods (PIX, credit card, bank transfer, cash) | Dev   | Payment method selection                      |
| Overdue invoice marking logic                           | Dev   | Auto-set status = 'overdue' based on due_date |

### Sprint 4: Reporting & Polish (2 weeks)

| Task                                                 | Owner    | Deliverable                       |
| ---------------------------------------------------- | -------- | --------------------------------- |
| Basic reports dashboard (sales, products, customers) | Dev      | API endpoints for chart data      |
| User role & permission system                        | Dev      | Role-based API access             |
| Settings & company configuration                     | Dev      | Company detail update API         |
| UI integration (Nuxt pages/components)               | Frontend | Basic CRUD pages                  |
| Final security audit                                 | Dev/Sec  | Pen test, rate limit verification |
| Release prep                                         | DevOps   | Docker prod config, env vars docs |

### 📅 Total Timeline: ~8 weeks (2 months)

**Parallel work possible**: Frontend UI can proceed once API contracts are stabilized.

---

## 9. Nuxt Module Recommendations

Consider adding these Nuxt modules to accelerate development:

| Module                | Use Case                                        | Priority                             |
| --------------------- | ----------------------------------------------- | ------------------------------------ |
| `@nuxt/ui`            | UI components (buttons, tables, forms, dialogs) | 🔴 High - accelerates frontend 3x    |
| `@nuxt/image`         | Image optimization for product photos           | 🟡 Medium - if product images needed |
| `@nuxt/fonts`         | Font management (if custom fonts)               | 🟢 Low                               |
| `nuxt-swiper`         | Carousels/galeries (product images)             | 🟢 Low                               |
| `vite-plugin-checker` | Type checking during dev                        | 🔴 High - catches errors early       |

**Do NOT add** heavy modules until API layer is stable. Keep it simple with hand-written services initially.

---

## 10. Open Questions & Decisions Needed

Before implementation starts, confirm:

1. **Database**: PostgreSQL is already set up. Any schema changes need migration files in `drizzle/` folder.
2. **Payments**: Will you integrate with a payment gateway (Stripe, MercadoPago, local acquirer) or keep it internal tracking only?
3. **Brazilian compliance**: CNPJ/CPF validation, NF-e/e-invoice requirements, fiscal localization?
4. **Multi-company**: Can a user belong to multiple companies? (Existing `company_member` supports this)
5. **Language**: Portuguese (BR) interface only, or i18n support needed?
6. **Hosting**: Same infrastructure (Docker + PostgreSQL) or different deployment?
7. **Data migration**: Existing customers/users need to be migrated to new schema? (Greenfield vs brownfield)

---

## 11. Quick Start Checklist

### Before First Code Write:

- [ ] Confirm ERP module priorities with stakeholders
- [ ] Decide on payment integration strategy
- [ ] Create database migration branch
- [ ] Set up feature branch: `git checkout -b feat/erp-planning`
- [ ] Ensure all existing tests pass: `pnpm test` (364 tests: 291 unit passed + 73 integration gated by Docker)
- [ ] Verify lint: `pnpm lint`
- [ ] Document any existing .env secrets needed (better-auth secret, CSRF secret, etc.)

### Day 1 Sprint 0:

- [ ] Create first migration file (`0020_products.sql`)
- [ ] Add `company_id` column + RLS policy to new tables
- [ ] Create `server/utils/auth/product/repository.ts` skeleton
- [ ] Write first unit test for product creation
- [ ] Commit: `feat: add product schema + basic repository`

### Weekly Checkpoints:

- [ ] Week 1: Foundation (migrations + repos) merged to dev
- [ ] Week 2: Phase 1 (products + customers) API complete + tested
- [ ] Week 3: Phase 2 (sales orders) API complete + integration tests
- [ ] Week 4: Phase 3 (invoices + payments) API complete
- [ ] Week 5-8: Iterative feature delivery + testing

---

## Conclusion

The **merp repository has a robust SaaS foundation** ready for ERP extension. The authentication, multi-tenancy, security, and testing infrastructure is already in place. This plan provides:

1. **Clear module boundaries** (products, customers, sales, invoicing, etc.)
2. **Database schema** extensions with RLS-ready design
3. **API contract patterns** consistent with existing codebase
4. **Security considerations** specific to ERP data sensitivity
5. **Testing strategy** following existing patterns
6. **8-week roadmap** with prioritized sprints

**Next step**: Review this plan with the team, confirm priorities, and start Sprint 0 (foundation migrations + repos).

---

_Plan generated: Mon Sep 21 2026_
_Based on codebase revision: adc9a46 (HEAD with security fixes)_
_Framework: Nuxt 4.5.2 + Better Auth 1.6.26 + Drizzle ORM + PostgreSQL_

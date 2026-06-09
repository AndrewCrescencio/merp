# Implementation Plan: Auth Bounded Context

**Branch**: `001-auth-context` | **Date**: 2026-06-10 | **Spec**: specs/001-auth-context/spec.md

**Input**: Feature specification from `/specs/001-auth-context/spec.md`

## Summary

Build the Auth bounded context for Merp — a multi-tenant SaaS ERP. This covers
user authentication (email/password via Better Auth), company management
(CNPJ-based multi-tenancy), role-based access (super_admin, owner, admin,
operator), and member invitation flow (with email via Resend).

## Technical Context

**Language/Version**: TypeScript 5.x, Nuxt 4 (Nitro server routes)

**Primary Dependencies**: Better Auth with Drizzle adapter, Drizzle ORM,
drizzle-orm/postgres-js, Resend (email), Vitest

**Storage**: Supabase PostgreSQL via DATABASE_URL. Drizzle Kit for migrations.

**Testing**: Vitest with mocked Drizzle queries for unit tests.
Integration tests with real database for RLS and cross-tenant isolation.

**Target Platform**: Web (Nitro server routes + Nuxt frontend)

**Project Type**: SaaS web application (multi-tenant ERP)

**Performance Goals**:
- Login/registration < 1s p95
- Company switching < 200ms p95
- Invite acceptance < 500ms p95

**Constraints**:
- Tenant isolation via RLS + app-level checks (defense in depth)
- Transactions for multi-step writes (CreateCompany, AcceptInvite)
- Idempotency for invite flow (no duplicate invites per email+company)
- Better Auth handles session primitives — no custom session logic

**Scale/Scope**: MVP targeting 1–100 companies, < 1000 users.
Fiscal domain will add the bulk of business entities later.

## Database Schema (Drizzle)

```typescript
// server/utils/schema.ts

const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  platformRole: text('platform_role'), // nullable: 'super_admin'
  createdAt: timestamp('created_at').defaultNow(),
});

const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  cnpj: text('cnpj').notNull().unique(),
  razaoSocial: text('razao_social').notNull(),
  nomeFantasia: text('nome_fantasia'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

const companyMembers = pgTable('company_members', {
  companyId: uuid('company_id').notNull().references(() => companies.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role').notNull(), // 'owner' | 'admin' | 'operator'
  invitedBy: text('invited_by').references(() => users.id),
  joinedAt: timestamp('joined_at').defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.companyId, t.userId] }),
}));

const companyInvites = pgTable('company_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  email: text('email').notNull(),
  role: text('role').notNull(), // 'admin' | 'operator'
  token: text('token').notNull().unique(),
  status: text('status').notNull().default('pending'), // pending | accepted | expired
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

**Tenant discriminator**: `companies.id` is the tenant identifier. All
future business tables MUST include a `companyId` column with a foreign
key to `companies.id`.

## Endpoints

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/auth/[...]` | Public | — | Better Auth catch-all |
| POST | `/api/companies` | Session | Any | Create company |
| GET | `/api/companies` | Session | Any | List user's companies |
| GET | `/api/companies/:id` | Session | Member | Get company details |
| POST | `/api/companies/:id/invites` | Session | owner/admin | Send invite |
| GET | `/api/companies/:id/invites` | Session | owner/admin | List pending invites |
| POST | `/api/invites/:token/accept` | Session | — | Accept invite |
| GET | `/api/invites/:token` | Public | — | Fetch invite metadata |

## RLS Policies

```sql
-- Companies: members can see their own companies
CREATE POLICY company_select ON companies
  FOR SELECT USING (
    id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND platform_role = 'super_admin')
  );

-- Company members: members can see members of their companies
CREATE POLICY member_select ON company_members
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  );

-- Future business tables: policy template
-- CREATE POLICY tenant_isolation ON <table>
--   FOR ALL USING (company_id = current_setting('app.current_company_id')::uuid);
```

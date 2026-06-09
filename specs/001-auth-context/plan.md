# Implementation Plan: Auth Bounded Context

**Branch**: `001-auth-context` | **Date**: 2026-06-10 | **Spec**: specs/001-auth-context/spec.md

**Input**: Feature description with authentication, multi-tenant company management, and RBAC flows.

## Summary

Build the Auth bounded context for Merp — a multi-tenant SaaS ERP. This covers
user authentication (email/password via Better Auth), company management
(CNPJ-based multi-tenancy), role-based access (super_admin, owner, admin,
operator), and member invitation flow (with email via Resend).

The context follows a Vertical Slice model: each use case is self-contained in
its own slice (`handler → service → repo + spec`), with dependency inversion via
per-slice repository interfaces. All business tables carry `company_id` as a
tenant discriminator, enforced by PostgreSQL Row-Level Security.

## Technical Context

**Language/Version**: TypeScript 5.x, Nuxt 4 (Nitro server routes)

**Primary Dependencies**: Better Auth with Drizzle adapter, Drizzle ORM,
drizzle-orm/postgres-js, Resend (email), Vitest

**Storage**: Supabase PostgreSQL via DATABASE_URL. Drizzle Kit for migrations.

**Testing**: Vitest with mocked repository interfaces for unit tests.
Integration tests with real database for RLS and cross-tenant isolation.

**Target Platform**: Web (Nitro server routes + Nuxt frontend)

**Project Type**: SaaS web application (multi-tenant ERP)

**Performance Goals**:
- Login/registration < 1s p95
- Company switching < 200ms p95
- Invite acceptance < 500ms p95

**Constraints**:
- Tenant isolation via RLS + repository checks (defense in depth)
- Transactions required for multi-step writes (CreateCompany, AcceptInvite)
- Idempotency for invite flow (no duplicate invites per email+company)
- Better Auth handles session primitives — no custom session logic

**Scale/Scope**: MVP targeting 1–100 companies, < 1000 users.
Fiscal domain will add the bulk of business entities later.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Notes |
|-----------|-------|-------|
| I — Bounded Contexts | ✅ PASS | Auth is isolated; communicates via session DTOs |
| II — Three-Layer Separation | ✅ PASS | handler → service → repo, co-localizados por slice |
| III — Inward Dependency Flow | ✅ PASS | Services depend only on repo interfaces |
| IV — Aggregate-Owned Repositories | ✅ PASS | Cada slice possui seu próprio `repo.ts` (interface + impl) |
| V — Test-First | ✅ PASS | All services require .spec.ts in same commit |
| VI — Error Handling | ✅ PASS | Typed throws via createError, consistent within context |
| VII — Tenant Isolation | ✅ PASS | company_id on all tables + RLS |
| VIII — Transactions & Idempotency | ✅ PASS | CreateCompany + AcceptInvite in tx; invites idempotent |

No violations requiring complexity justification.

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-context/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 (if needed)
├── data-model.md        # Phase 1 (if needed)
├── quickstart.md        # Phase 1 (if needed)
├── contracts/           # Phase 1
└── tasks.md             # Phase 2 (/speckit.tasks)
```

### Source Code — Nuxt 4 Structure 🎯

No Nuxt 4, as rotas Nitro ficam em `server/api/`. As rotas são **finas** (só
delegam) e toda a lógica de um caso de uso fica co-localizada em seu próprio
slice dentro de `features/auth/`.

```text
server/
├── api/
│   ├── auth/
│   │   └── [...].ts              # Better Auth catch-all (delega para shared/auth.ts)
│   ├── companies/
│   │   ├── index.ts              # POST + GET /api/companies
│   │   └── [id]/
│   │       ├── index.ts          # GET /api/companies/:id
│   │       └── invites/
│   │           └── index.ts      # POST + GET /api/companies/:id/invites
│   ├── invites/
│   │   └── [token]/
│   │       ├── index.ts          # GET /api/invites/:token
│   │       └── accept.ts         # POST /api/invites/:token/accept
│   └── ...                       # Futuros contextos
├── middleware/
│   └── auth.ts                   # Sessão → event.context.user
│
features/auth/
├── create-company/
│   ├── handler.ts                # Validação + parse → chama service
│   ├── service.ts                # Regras de negócio (tx: company + member)
│   ├── schema.ts                 # Zod: CreateCompanyInput / CreateCompanyOutput
│   ├── repo.ts                   # ICompanyRepository + DrizzleCompanyRepository
│   └── create-company.spec.ts
├── list-companies/
│   ├── handler.ts
│   ├── service.ts
│   ├── schema.ts
│   ├── repo.ts
│   └── list-companies.spec.ts
├── get-company/
│   ├── handler.ts
│   ├── service.ts
│   ├── schema.ts
│   ├── repo.ts
│   └── get-company.spec.ts
├── invite-member/
│   ├── handler.ts
│   ├── service.ts                # Idempotência: sem convites duplicados por email+company
│   ├── schema.ts
│   ├── repo.ts                   # ICompanyInviteRepository + DrizzleCompanyInviteRepository
│   └── invite-member.spec.ts
├── list-invites/
│   ├── handler.ts
│   ├── service.ts
│   ├── schema.ts
│   ├── repo.ts
│   └── list-invites.spec.ts
├── get-invite/
│   ├── handler.ts
│   ├── service.ts
│   ├── schema.ts
│   ├── repo.ts
│   └── get-invite.spec.ts
├── accept-invite/
│   ├── handler.ts
│   ├── service.ts                # Tx: aceita invite + cria membro
│   ├── schema.ts
│   ├── repo.ts                   # ICompanyInviteRepository + ICompanyMemberRepository
│   └── accept-invite.spec.ts
├── switch-company/               # Sem endpoint HTTP; usado por middleware/composable
│   ├── service.ts
│   ├── repo.ts
│   └── switch-company.spec.ts
└── _shared/
    ├── types.ts                  # User, Company, CompanyMember, CompanyInvite
    └── email.ts                  # IEmailProvider + ResendEmailProvider

shared/
├── auth.ts                      # Better Auth instance
├── db.ts                        # Drizzle instance
└── logger.ts                    # Structured logger

app/                               # Nuxt 4 — frontend (Vue)
├── pages/
├── components/
└── composables/
```

### Fluxo da Requisição (Nuxt 4)

```
Cliente → server/api/companies/index.ts (rota Nitro fina)
         → features/auth/create-company/handler.ts (validação + parsing)
         → features/auth/create-company/service.ts (regras de negócio)
         → features/auth/create-company/repo.ts (tx via shared/db.ts)
         → Resposta HTTP
```

### Database Schema (Drizzle)

```typescript
// shared/schema.ts — or per-context schema files

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

**Migration notes**: `companies.id` is the tenant discriminator. All future
business tables (nota, emitente, etc.) MUST include a `companyId` column
with a foreign key to `companies.id`.

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

## Complexity Tracking

> No violations requiring justification. Architecture is aligned with the
> constitution: per-slice repos with dependency inversion, vertical slice
> organization (handler → service → repo), tenant isolation via company_id,
> and transactional writes where needed.
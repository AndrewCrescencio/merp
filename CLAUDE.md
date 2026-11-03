# CLAUDE.md — MERP

Regras para agentes trabalhando neste repo. **Código > docs.**

## Contexto do Produto

Ver [`docs/PROJETO.md`](docs/PROJETO.md) para estado atual, matriz de funcionalidades, regras de negócio e roadmap.

## Prioridade de Verdade

Em caso de conflito:

1. **Regras de negócio** (validações, cálculos, FSMs no código)
2. **Código** (implementação real)
3. **Documentação** (apenas descreve; se contradiz os acima, está errada ou desatualizada)

## Stack e Versões

- Node 24 (`.nvmrc`)
- Nuxt 4 (Nitro server engine)
- Better Auth 1.7.7 (email/password, verificação, reset)
- Drizzle ORM 0.45.4
- PostgreSQL 16 (container Docker)
- Vitest 5.0.4
- TypeScript 6.0.3
- Zod 4.6.7

Fonte: `package.json`

## Estrutura de Pastas (Vertical Slices)

```
server/
├─ api/                      # 89 handlers (7 auth, 2 health, 78 company-scoped, 1 security.txt)
│  ├─ auth/                  # register, login, logout, verify, reset
│  ├─ health/                # live, ready
│  └─ v1/
│     ├─ companies/          # company CRUD, members, invitations
│     └─ me/                 # perfil, data-export, deactivate, consents
├─ middleware/               # 00-no-store, 01-csrf-token, 02-csrf-validate, auth, tenant, pii-audit
├─ templates/print/          # .hbs (kitchen ticket, receipt)
└─ utils/
   ├─ auth/
   │  ├─ identity/           # queries.ts, client.ts (Better Auth)
   │  ├─ company/            # repository, location, product, membership, authorization
   │  └─ invite/             # repository
   ├─ order/                 # repository (create, list, complete, cancel)
   ├─ restaurant/            # repository (tables, tickets, shifts)
   ├─ print/                 # repository (printers, jobs)
   ├─ schema/                # Drizzle tables (19 arquivos)
   ├─ shared/                # errors, security, email, csrf, ip, audit, background
   └─ db/                    # db.ts, tenant-context.ts (withTenant)
app/
├─ pages/auth/               # login, register, verify, reset, forget-password
└─ middleware/               # auth.global.ts
drizzle/
├─ 0000_functions_and_roles.sql
├─ 0001_baseline.sql
├─ 0002_rls_policies_grants.sql
├─ 0003_order_idempotency_fingerprint.sql
└─ 0004_p03_p04_restaurant_kitchen.sql
```

## Comandos (Confirmados no Código)

```bash
# Dev
npm run dev                  # nuxt dev (porta 3000)
npm run build                # nuxt build
npm run preview              # nuxt preview

# Database
npm run db:migrate:full      # check-db + drizzle-kit migrate + verify-rls
npx drizzle-kit generate --name <nome>
npx drizzle-kit studio

# Testes
npm test                     # vitest run (unit + integration + e2e)
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:watch

# Qualidade
npm run check                # format:check + lint + typecheck + check:routes
npm run lint                 # eslint
npm run typecheck            # tsc -b --noEmit && tsc -p tsconfig.tests.json
npm run format               # prettier --write
npm run format:check         # prettier --check
npm run check:routes         # tsx scripts/check-routes.ts
```

Fonte: `package.json:scripts`

## Convenções de Código

### Handlers

- **Auth endpoints:** `server/api/auth/*.post.ts` — `defineEventHandler`, sem autenticação
- **Company-scoped:** `server/api/v1/companies/[companyId]/*.ts` — usa `requireUser()` + `requireTenant()`
- **Padrão:** `export default defineEventHandler(async (event) => { ... })`
- **Validação:** Zod schema no topo do arquivo, `readBody(event)` + `.parse()`
- **Erros:** `sendValidationError()`, `sendConflictError()`, `sendUnauthorizedError()`, `sendNotFoundError()`, `sendForbiddenError()`

Fonte: `server/api/**/*.ts`

### Repositories

- **Padrão:** `export class XxxRepository { async method() { ... } }` + `export const xxxRepository = new XxxRepository()`
- **Exemplos:** `CompanyRepository`, `LocationRepository`, `ProductRepository`, `InviteRepository`, `TableOrderRepository`
- **Objetos simples:** `orderRepository = { async create() {}, async list() {} }` (sem classe)
- **RLS backstop:** todo query roda dentro de `withTenant(companyId, locationId, userId, async (tx) => { ... })`
- **Erros:** `throw new Error('...')` ou `rethrowXxxError(error)` (funções específicas por contexto)

Fonte: `server/utils/auth/company/*.ts`, `server/utils/order/repository.ts`

### Schema Drizzle

- **Padrão:** `export const tableName = pgTable('table_name', { ... })`
- **Timestamps:** `createdAt`, `updatedAt` (camelCase no código, `created_at`/`updated_at` no banco)
- **Soft delete:** `deletedAt` (nullable timestamp)
- **IDs:** `text PRIMARY KEY DEFAULT gen_random_uuid()`
- **Dinheiro:** `numeric(12, 2)` (unitPrice, totalAmount, lineTotal)
- **Quantidade:** `numeric(10, 3)` (spec pede 12, código usa 10 — divergência conhecida)
- **Foreign keys:** `.references(() => otherTable.id, { onDelete: 'cascade' })`

Fonte: `server/utils/schema/*.ts`

### Validação Zod

- **Padrão:** `const xxxSchema = z.object({ ... })` no topo do handler
- **String:** `z.string().min(1).max(255)`
- **Email:** `z.string().email()`
- **UUID:** `z.string().uuid()`
- **Numeric string:** `z.string().regex(/^\d+(\.\d{1,2})?$/)` (preço)
- **CNPJ:** validação customizada em `isValidCnpj()` após parse

Fonte: `server/api/**/*.ts`, `server/utils/shared/security.ts`

### Imports

- **Alias:** `~~/server/utils/...` (resolução de workspace root)
- **Shared:** `#shared/auth`, `#shared/logger`
- **H3:** `import { defineEventHandler, readBody, getRouterParam } from 'h3'`
- **Drizzle:** `import { eq, and, sql } from 'drizzle-orm'`
- **Schema:** `import { order, orderItem } from '~~/server/utils/schema'`

Fonte: `server/**/*.ts`

### Testes

- **Unit:** `*.spec.ts` — mocks de dependências, foca em lógica isolada
- **Integration:** `*.test.ts` — banco real (PostgreSQL container), role `merp_app`, RLS ativo
- **Padrão:** `describe('XxxRepository', () => { ... })`, `it('should ...', async () => { ... })`
- **Helpers:** `createOwnerDbForSetupOnly()` (setup/seed apenas), `withTenant()` (asserções)
- **RLS canary:** `server/utils/00-rls-canary.test.ts` — falha se suite roda como owner

Fonte: `server/**/*.spec.ts`, `server/**/*.test.ts`

## Regras de Negócio Críticas

### Multi-tenancy (RLS)

- Isolamento via PostgreSQL RLS: `get_tenant_id()` + `get_location_id()`
- `withTenant(companyId, locationId, userId, async (tx) => { ... })` seta GUCs e roda callback em transação
- Policies: `company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)`
- Role `merp_app` com `NOBYPASSRLS` — nunca bypassa RLS
- 17 tabelas com `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`

Fonte: `drizzle/0002_rls_policies_grants.sql`, `server/utils/db/tenant-context.ts`, `docs/decisions.md`

### Dinheiro

- `numeric(12,2)` para valores monetários
- `round_half_up(value, 2)` aplicado por linha: `line_total = round_half_up(unit_price * quantity - discount_applied)`
- **Divergência conhecida:** `total_amount` é recalculado em JS com `Math.round()` (deveria ser `SUM(line_total)` em SQL) — corrigir em P0.7

Fonte: `drizzle/0000_functions_and_roles.sql:round_half_up`, `server/utils/schema/order-item.ts:33`, `docs/PROJETO.md`

### Autorização

- **Owner-only:** criar convite, soft delete de empresa, CRUD de locations/products/mesas/estações
- **Qualquer membro:** listar produtos, mesas, orders
- **Sem autorização por papel em order/restaurant:** divergência conhecida — qualquer membro pode criar/completar/cancelar order (corrigir em P1.1)

Fonte: `server/utils/auth/company/authorization.ts`, `docs/PROJETO.md`

### Idempotência de Order

- Header `Idempotency-Key` (alias no body `idempotencyKey`)
- Coluna `idempotency_key` + `idempotency_fingerprint` (hash SHA-256 do payload)
- Índice único `(company_id, idempotency_key)`
- Replay: mesma chave + mesmo fingerprint → retorna order existente; chave igual + fingerprint diferente → 409

Fonte: `drizzle/0003_order_idempotency_fingerprint.sql`, `server/utils/order/repository.ts:62:orderFingerprint`

### FSMs

- **Kitchen ticket:** `pending → in_progress → ready → served|cancelled` (constante `KITCHEN_TRANSITIONS`)
- **Order:** `open → completed|cancelled` (simplificado; spec pede `preparing`, `ready` — adicionar em P0.6)
- **Cashier shift:** `open → closed`
- **Restaurant table:** `available → occupied → available`

Fonte: `server/utils/restaurant/repository.ts:11`, `server/utils/auth/company/kitchen-ticket-repository.ts:10`

### Rate Limit

- **Por usuário autenticado:** 60 req/min (sliding window)
- **Por IP:** 20 req/min
- **Por email:** 5 req/min (register, forgot-password)
- **Lockout:** (email+IP) 10 tentativas + global email 50 → 30min

Fonte: `server/middleware/auth.ts`, `server/utils/shared/security.ts`, `docs/decisions.md`

### CSRF

- Double-submit: `x-csrf-token` header obrigatório (exceto GET/HEAD/OPTIONS e auth endpoints)
- Cookie `csrf-token` httpOnly, Secure (prod), SameSite=Lax
- Geração: `01-csrf-token.ts` (middleware)
- Validação: `02-csrf-validate.ts` (middleware)

Fonte: `server/middleware/01-csrf-token.ts`, `server/middleware/02-csrf-validate.ts`, `server/utils/shared/csrf.ts`

## Arquivos Protegidos (Não Editar Sem Justificativa)

### Migrations Aplicadas

- `drizzle/0000_functions_and_roles.sql`
- `drizzle/0001_baseline.sql`
- `drizzle/0002_rls_policies_grants.sql`
- `drizzle/0003_order_idempotency_fingerprint.sql`
- `drizzle/0004_p03_p04_restaurant_kitchen.sql`

**Regra:** migrations aplicadas nunca são editadas; criar nova migration para mudanças.

### Comportamento de Produção

- `server/middleware/*.ts` — auth, tenant, csrf, rate limit
- `server/utils/db/tenant-context.ts` — `withTenant()` (RLS core)
- `server/utils/shared/security.ts` — CNPJ, lockout, rate limit
- `shared/auth.ts` — Better Auth singleton

**Regra:** editar apenas com testes de integração confirmando que RLS, rate limit e CSRF continuam funcionando.

## Divergências Conhecidas (Não Corrigir Agora)

1. **Total amount em JS** — corrigir em P0.7 (SUM SQL)
2. **Quantity `numeric(10,3)`** — spec pede `(12,3)`, migrar em P0.7
3. **Sem autorização por papel** — adicionar em P1.1
4. **FSM simplificada de order** — adicionar `preparing`, `ready` em P0.6
5. **Idempotência insegura** — `getById` sem passar `tx` dentro da transação, corrigir em P0.6
6. **Cashier shift confia no cliente** — `expectedAmount`/`actualAmount` do body, não derivados de orders

Fonte: `docs/PROJETO.md`, `FEATURE_AUDIT_E_ROADMAP.md`

## Antes de Mudar Código

1. **Leia o contexto:** `docs/PROJETO.md` para estado atual, `docs/decisions.md` para ADRs
2. **Verifique se não é divergência conhecida** (lista acima)
3. **Confirme no código:** não confie apenas na spec/doc; leia o arquivo real
4. **Teste de integração se tocar RLS, auth, tenant ou middleware**

## Problemas? Bugs?

- **Não corrija comportamento de produção sem teste que confirme o bug** (RLS, auth, rate limit, CSRF são críticos)
- **Reporte divergências em vez de corrigir** se não há spec/ADR pedindo a mudança
- **Priorize o roadmap:** P0.6–P0.9 (MVP) antes de refatorações ou otimizações

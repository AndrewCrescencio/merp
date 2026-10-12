---
title: 'Como Criar um Endpoint (handler → Repository) — MERP'
slug: 'create-endpoint-guide'
category: 'guide'
status: 'active'
version: '1.0.0'
owner: '@tech-lead'
reviewers: ['@architect']
module: 'getting-started'
tags: ['handler', 'repository', 'endpoint', 'tutorial', 'pattern']
audience: ['dev', 'qa']
created: '2026-10-10'
updated: '2026-10-10'
review-cycle: 'quarterly'
related:
  - 'context-map'
  - 'cli-commands'
replaces: []
replaced-by: null
---

# Como Criar um Endpoint Seguindo handler → Repository

Guia prático usando arquivos reais do repo. Padrão: **handler → Repository → Drizzle** (sem Service layer).

---

## Exemplo Real: Abrir Mesa (Restaurant)

### 1. Handler — `server/api/restaurant/tables/[id]/open.post.ts`

```ts
import { defineAuthHandler } from '#shared/handler'
import { restaurantRepository } from '#shared/utils/restaurant'
import { z } from 'zod'

const bodySchema = z.object({
  coverCount: z.number().int().positive().default(1),
  waiterId: z.string().uuid().optional(),
})

export default defineAuthHandler(async (event) => {
  const tableId = event.context.params.id
  const { coverCount, waiterId } = await readValidatedBody(event, bodySchema.parse)
  const { companyId, locationId, userId } = event.context.auth

  const result = await restaurantRepository.openTable({
    tableId,
    companyId,
    locationId,
    userId,
    coverCount,
    waiterId,
  })

  return result
})
```

**Pontos-chave:**

- `defineAuthHandler` — wrapper que injeta `event.context.auth` (companyId, locationId, userId)
- Validação Zod inline com `readValidatedBody`
- Chama `restaurantRepository.openTable` passando IDs do auth context
- Retorna direto o resultado do repository

---

### 2. Repository — `server/utils/restaurant/repository.ts` (trecho)

```ts
import { withTenant } from '#shared/db/tenant-context'
import { db } from '#shared/db'
import { restaurantTable, order, orderDineIn } from '#shared/schema'
import { eq, and } from 'drizzle-orm'

export const restaurantRepository = {
  async openTable({ tableId, companyId, locationId, userId, coverCount, waiterId }) {
    return withTenant(companyId, locationId, userId, async (tx) => {
      // 1. Verifica mesa existe e está livre
      const table = await tx
        .select()
        .from(restaurantTable)
        .where(
          and(
            eq(restaurantTable.id, tableId),
            eq(restaurantTable.companyId, companyId),
            eq(restaurantTable.locationId, locationId),
            eq(restaurantTable.status, 'free'),
          ),
        )
        .limit(1)

      if (!table[0]) {
        throw createError({
          statusCode: 404,
          message: 'Mesa não encontrada ou ocupada',
          code: 'TABLE_NOT_AVAILABLE',
        })
      }

      // 2. Cria order (dine_in) + order_dine_in em transação
      const [newOrder] = await tx
        .insert(order)
        .values({
          companyId,
          locationId,
          orderType: 'dine_in',
          status: 'open',
          createdBy: userId,
          totalAmount: '0.00',
        })
        .returning({ id: order.id })

      await tx.insert(orderDineIn).values({
        orderId: newOrder.id,
        tableId,
        coverCount,
        waiterId,
        openedAt: new Date(),
      })

      // 3. Atualiza mesa para occupied + currentOrderId
      await tx
        .update(restaurantTable)
        .set({ status: 'occupied', currentOrderId: newOrder.id })
        .where(eq(restaurantTable.id, tableId))

      return { orderId: newOrder.id, tableId, status: 'opened' }
    })
  },

  // ... outros métodos: closeTable, listCashierShifts, etc.
}
```

**Pontos-chave:**

- `withTenant(companyId, locationId, userId, fn)` — **obrigatório** para RLS
- Seta GUCs: `app.tenant_id`, `app.location_id`, `app.user_id` (lidas por `get_tenant_id()`/`get_location_id()`/`get_user_id()`, fail-closed via `NULLIF`)
- Recebe `tx` (transaction) do `withTenant` — usa para todas as queries
- RLS policies no PostgreSQL garantem isolamento (fail-closed)
- Erros lançados com `createError` (h3) → middleware converte para HTTP

---

### 3. Schema — `server/utils/schema/restaurant-table.ts` (trecho)

```ts
import { pgTable, uuid, varchar, integer, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core'

export const tableStatus = pgEnum('table_status', ['free', 'occupied', 'reserved', 'closed'])

export const restaurantTable = pgTable(
  'restaurant_table',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => company.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => location.id),
    number: integer('number').notNull(),
    name: varchar('name', { length: 100 }),
    capacity: integer('capacity').notNull().default(4),
    status: tableStatus('status').notNull().default('free'),
    currentOrderId: uuid('current_order_id').references(() => order.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyLocationIdx: uniqueIndex('restaurant_table_company_location_idx').on(
      t.companyId,
      t.locationId,
    ),
    numberUnique: uniqueIndex('restaurant_table_number_unique').on(
      t.companyId,
      t.locationId,
      t.number,
    ),
  }),
)
```

---

### 4. RLS Policy (aplicada via `scripts/apply-custom-sql.ts`)

O padrão real é **uma policy por operação** (`SELECT`/`INSERT`/`UPDATE`/`DELETE`), não `FOR ALL`, usando os helpers `get_tenant_id()`/`get_location_id()` (fail-closed: `NULLIF(current_setting(..., true), '')`):

```sql
-- Exemplo: restaurant_table (location-scoped)
CREATE POLICY restaurant_table_select ON restaurant_table FOR SELECT TO merp_app
  USING (company_id = get_tenant_id() AND location_id = get_location_id());
CREATE POLICY restaurant_table_insert ON restaurant_table FOR INSERT TO merp_app
  WITH CHECK (company_id = get_tenant_id() AND location_id = get_location_id());
-- + restaurant_table_update / restaurant_table_delete
```

Tabelas company-scoped (sem `location_id`) usam só `get_tenant_id()`; `order_dine_in`/`order_takeout` usam `EXISTS` sobre `order`. Detalhe em `docs/07-reference/database-schema.md`.

---

## Checklist para Novo Endpoint

- [ ] **Handler** em `server/api/<contexto>/<recurso>/<acao>.method.ts`
- [ ] Usa `defineAuthHandler` (autenticado) ou `definePublicHandler` (público)
- [ ] Validação Zod no body/query/params
- [ ] Extrai `companyId`, `locationId`, `userId` de `event.context.auth`
- [ ] Chama **um** método do Repository correspondente
- [ ] **Repository** em `server/utils/<contexto>/repository.ts`
- [ ] Método do Repository usa `withTenant(companyId, locationId, userId, async (tx) => { ... })`
- [ ] Queries Drizzle usam `tx` (transaction) recebido
- [ ] Schema em `server/utils/schema/<tabela>.ts` com `companyId` + `locationId` NOT NULL
- [ ] RLS policy para a tabela (company + location scoped, fail-closed)
- [ ] Testes: unit (mock tx) + integration (DB real com `DB_AVAILABLE=true`)

---

## Padrões de Repository no Repo

| Padrão                                         | Contextos                   | Exemplo                                                                                                         |
| ---------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Object + type alias** (recomendado p/ novos) | Restaurant, Order, Print    | `export const restaurantRepository = { async method() {} }`                                                     |
| **Class + singleton**                          | Company, Invite, Membership | `export class CompanyRepository { async method() {} } export const companyRepository = new CompanyRepository()` |
| **Functions (via Better Auth)**                | Identity                    | `export async function signInUser() {}` em `queries.ts`                                                         |

**Para novos contextos:** use **Object + type alias** (menos boilerplate, mesmo poder).

---

## Comandos Úteis

```bash
# Nova migração após criar schema
pnpm drizzle-kit generate --name add_restaurant_table

# Aplicar migrações + RLS (banco novo)
pnpm db:migrate:full

# Testes unitários
pnpm test server/utils/restaurant/repository.spec.ts

# Testes integração (requer Postgres)
DB_AVAILABLE=true pnpm test server/utils/restaurant/repository.test.ts

# Lint + Typecheck
pnpm lint && pnpm typecheck
```

---

## Erros Comuns a Evitar

| Erro                                    | Correto                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ |
| Esquecer `withTenant`                   | Sempre usar `withTenant` em repository methods                           |
| Usar `db` direto (sem tx)               | Usar `tx` passado pelo `withTenant`                                      |
| Não passar `locationId` no `withTenant` | `withTenant(companyId, locationId, userId, fn)` — **3 IDs obrigatórios** |
| Handler chama Drizzle direto            | Handler → Repository → Drizzle                                           |
| Criar Service layer                     | Não — handler chama repository direto                                    |
| Interface `IRepository` sem 2+ impls    | Concreto é suficiente; interface só se múltiplas impls reais             |

---

## Referências

- `docs/07-reference/context-map.md` — Mapa de todos contextos
- `specs/decisions/ADR-008` — Vertical slices package by feature
- `specs/000-foundation/endpoint-pattern.md` — Padrão de endpoint (erro, rate limit, CSRF, paginação)
- `specs/000-foundation/rls-pattern.md` — Template de policy RLS
- `server/utils/shared/handler.ts` — `defineAuthHandler`, `definePublicHandler`
- `server/utils/shared/errors.ts` — `createError`, `handleDatabaseError`
- `server/utils/db/tenant-context.ts` — `withTenant` implementation

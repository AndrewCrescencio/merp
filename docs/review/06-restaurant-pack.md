# Parte 6: Restaurant Pack — Relatório de Revisão

## Escopo

- `server/api/restaurant/` — Handlers:
  - `cashier/shifts.post.ts`, `cashier/shifts.get.ts`, `cashier/shifts/[id].get.ts`, `cashier/shifts/[id]/close.post.ts`, `cashier/shifts/current.get.ts`
  - `tables/[id]/open.post.ts`, `tables/[id]/close.post.ts`
  - `kitchen/tickets/[id]/status.patch.ts`
- `server/utils/restaurant/repository.ts` — `RestaurantRepository` (tables, kitchen tickets, cashier shifts)
- Schemas: `restaurant-table.ts`, `kitchen-station.ts`, `kitchen-ticket.ts`, `cashier-shift.ts`
- Spec: `specs/consolidated-specs.md` seção 3 (Print) + Restaurant Pack planejado em `specs/README.md` Phase 5

---

## Veredito

| Critério             | Status | Justificativa                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1 — Bugs/Falhas** | ❌     | **CRÍTICO**: Mesmo bug `event.context.auth` de Core Order — **todos handlers restaurant falham com 401**; `kitchenTicket` schema tem coluna `items` (jsonb?) mas migration 0016 não cria tabela `kitchen_ticket`; `restaurantTable.current_order_id` não é FK; `kitchenTicket` status enum não validado no DB |
| **R2 — Segurança**   | ⚠️     | RLS backstop via `withTenant` mas **location-scoped RLS ausente** (P02-A01); owner-only não aplicado (qualquer member pode abrir mesa/turno); auditoria básica presente                                                                                                                                       |

---

## Achados

### P06-A01 — CRÍTICO: Handlers restaurant usam `event.context.auth` inexistente (mesmo bug P05-A01)

- **Tipo**: Bug (quebra total)
- **Severidade**: **Crítica**
- **Confiança**: Alta
- **Arquivo**: `server/api/restaurant/cashier/shifts.post.ts:5`, `server/api/restaurant/tables/[id]/open.post.ts:5`, `server/api/restaurant/kitchen/tickets/[id]/status.patch.ts:5`, todos handlers restaurant
- **Evidência**: Todos fazem `const auth = event.context.auth` e `const { companyId, locationId } = auth.session`. Middleware seta `event.context.session` (com `activeCompanyId`) mas **não `locationId`** na session. Session schema tem `activeCompanyId` apenas. `locationId` viria de onde? Handler assume `auth.session.locationId` que não existe.
- **Impacto**: **Todos endpoints restaurant (mesas, turnos, kitchen tickets) retornam 401 ou crash** — funcionalidade totalmente quebrada.
- **Correção**:
  1. Fix middleware para incluir `locationId` no session (precisa source: user preference? last used? company default?)
  2. Mudar handlers para `event.context.session` + `event.context.user`
  3. Validar se usuário tem acesso à `locationId` (membership + location pertence à company)

### P06-A02 — Tabela `kitchen_ticket` não criada na migration 0016 (schema existe mas tabela não)

- **Tipo**: Bug (schema drift)
- **Severidade**: Alta
- **Confiança**: Alta
- **Arquivo**: `drizzle/0016_restaurant_pack.sql` (só cria `cashier_shift`), `server/utils/schema/kitchen-ticket.ts` (exportado no index)
- **Evidência**: Migration 0016 só tem `cashier_shift`. Schemas `kitchen-station.ts`, `kitchen-ticket.ts` exportados no `schema/index.ts` → `drizzle-kit push` cria tabelas mas **sem RLS, sem policies, sem grants**. `kitchenTicket` referenciada em `printJob` (0015: `kitchenTicketId` FK) mas tabela não existe na migration custom.
- **Impacto**: Se `drizzle-kit push` rodou, tabela existe sem RLS → vazamento total cross-tenant. Se não rodou, FK em `print_job` falha.
- **Correção**:
  1. Adicionar `kitchen_station` + `kitchen_ticket` na migration 0016 (ou nova 0023) com RLS `company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)`
  2. Adicionar grants para `merp_app`
  3. Adicionar `get_location_id()` function (P02-A01)

### P06-A03 — `restaurantTable.current_order_id` não é FK (text solto)

- **Tipo**: Bug (data integrity)
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `server/utils/schema/restaurant-table.ts:22`, `drizzle/0014_add_order_tables.sql:101`
- **Evidência**: `currentOrderId: text('current_order_id')` — sem `.references()`. Migration 0014 linha 101: `"current_order_id" text,` sem constraint. Mesa pode referenciar order inexistente ou de outro tenant.
- **Impacto**: Dangling references. Ao fechar mesa, `currentOrderId` setado para `null` (repository linha 116) mas não validado na abertura.
- **Correção**: Adicionar FK `references(() => order.id, { onDelete: 'set null' })` + RLS policy na tabela order já cobre.

### P06-A04 — `kitchenTicket.status` enum não validado no DB (apenas no TS)

- **Tipo**: Bug (data integrity)
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `server/utils/schema/kitchen-ticket.ts:30`, `server/utils/restaurant/repository.ts:40`
- **Evidência**: Schema TS: `status: text('status').notNull().default('pending')` — comentário diz `'pending' | 'preparing' | 'ready' | 'delivered'`. Repository `UpdateKitchenTicketStatusInput` valida TS enum mas **DB aceita qualquer text**. Migration 0016 não cria tabela.
- **Impacto**: Estado inválido pode ser inserido via SQL direto ou bug no app.
- **Correção**: Adicionar `CHECK (status IN ('pending','preparing','ready','delivered','cancelled'))` na migration.

### P06-A05 — Qualquer member pode abrir mesa/turno (sem check de role)

- **Tipo**: Segurança (autorização)
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `server/api/restaurant/tables/[id]/open.post.ts`, `server/api/restaurant/cashier/shifts.post.ts`
- **Evidência**: Handlers só checam `auth?.user` (autenticado). Não validam role na company. `openTable`/`openCashierShift` permitem qualquer membro abrir mesa/turno. Spec não define roles para restaurant ops.
- **Impacto**: Garçom/caixa pode abrir mesa, mas não deveria poder fechar caixa de outro? `closeCashierShift` valida `shiftId` mas não role.
- **Correção**: Definir roles restaurant (waiter, cashier, manager) + check no handler ou policy DB.

### P06-A06 — `kitchenTicket.items` schema TS não tem campo `items` (repository insere `items: input.items`)

- **Tipo**: Bug (schema drift)
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `server/utils/schema/kitchen-ticket.ts` (não tem `items`), `server/utils/restaurant/repository.ts:164`
- **Evidência**: Repository `createKitchenTicket` faz `.values({ ..., items: input.items })` mas schema `kitchenTicket` não tem coluna `items`. Migration 0016 não cria tabela. Se `drizzle-kit push` criou, coluna `items` não existe → erro runtime.
- **Correção**: Adicionar `items: jsonb('items').notNull().default('[]')` no schema + migration.

### P06-A07 — `cashierShift.difference` calculado no app (float precision risk)

- **Tipo**: Bug (dinheiro)
- **Severidade**: Baixa
- **Confiança**: Média
- **Arquivo**: `server/utils/restaurant/repository.ts:264-277`
- **Evidência**: `closeCashierShift` calcula `difference = actualAmount - expectedAmount` em JS (`Number()`), salva `.toFixed(2)`. `openingFloat`, `closingFloat`, `expectedAmount`, `actualAmount` são `numeric(12,2)` no DB. Cálculo no app perde precisão decimal.
- **Impacto**: Diferença de centavos por float arithmetic. Baixo risco se valores pequenos.
- **Correção**: Calcular no DB: `difference: sql`${actualAmount} - ${expectedAmount}`` ou usar `round_half_up`.

### P06-A08 — `kitchenStation` tabela não criada em migration (schema exportado)

- **Tipo**: Bug (schema drift)
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `server/utils/schema/kitchen-station.ts` (exportado), `drizzle/0016_restaurant_pack.sql` (ausente)
- **Evidência**: `kitchenStation` referenciada por `kitchenTicket.stationId` (FK). Sem tabela, FK falha ou `drizzle-kit push` cria sem RLS/grants.
- **Correção**: Adicionar na migration 0016/0023 com RLS location-scoped.

---

## Pontos Fortes

- **Cashier shift reconciliation**: `difference === 0 ? 'reconciled' : 'closed'` — bom para auditoria
- **Shift uniqueness**: `openCashierShift` previne turno duplicado por user (query `status='open'`)
- **Table status machine**: `available → occupied → available` validado no repository
- **Kitchen ticket priority**: `priority` integer para ordenação KDS
- **`withTenant` em todas queries**: RLS backstop (company + location + user)

---

## Sinais para Roadmap

- **P0 (bloqueador)**: Fix `event.context.auth` bug (P06-A01) — **quebra todos endpoints restaurant**
- **P0 (bloqueador)**: Criar tabelas `kitchen_station`, `kitchen_ticket` com RLS location-scoped + grants (P06-A02, P06-A08)
- **P0 (bloqueador)**: RLS location-scoped `get_location_id()` (P02-A01) — restaurant tables, kitchen tickets, cashier shifts precisam isolamento por location
- **P1**: Adicionar FK `current_order_id` em `restaurant_table`
- **P1**: CHECK constraint em `kitchenTicket.status`
- **P1**: Definir roles restaurant (waiter, cashier, manager) + autorização
- **P2**: `jsonb items` em `kitchenTicket` + schema sync

---

## Não Verificado / Dúvidas

- `kitchen/tickets/[id]/status.patch.ts` handler não lido completamente
- `cashier/shifts/current.get.ts` — current user shift endpoint
- `kitchen/station` CRUD endpoints não existem (só schema)
- SSE para KDS (real-time) — não implementado (spec menciona KDS/SSE)
- Print integration: order criado → kitchen ticket auto-created? Não parece haver hook

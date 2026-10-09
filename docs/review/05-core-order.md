# Parte 5: Core Order — Relatório de Revisão

## Escopo

- `server/api/orders/` — Handlers: `POST /orders` (create), `GET /orders/[id]`, `POST /orders/[id]/complete`, `POST /orders/[id]/cancel`
- `server/utils/order/repository.ts` — `OrderRepository` (create, getById, complete, cancel, list)
- Schemas: `order.ts`, `order-item.ts`, `order-dine-in.ts`, `order-takeout.ts`, `party.ts`, `product.ts`, `restaurant-table.ts`
- Spec: `specs/consolidated-specs.md` seção 2 (Core Order)

---

## Veredito

| Critério             | Status | Justificativa                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R1 — Bugs/Falhas** | ❌     | **CRÍTICO**: Handlers usam `event.context.auth` mas middleware seta `event.context.user`/`session` — **todos endpoints de order falham com 401**; `round_half_up` function criada na migration 0022 APÓS order_item (0014) — falha em banco limpo; FSM não implementado (apenas `open`/`completed`/`cancelled`); `locationId` não validado contra membership |
| **R2 — Segurança**   | ⚠️     | RLS backstop via `withTenant(companyId, locationId, ...)` mas **location-scoped RLS ausente** (P02-A01); idempotency key required; snapshot rule em order_item; **MAS** auth context bug quebra autorização completamente                                                                                                                                    |

---

## Achados

### P05-A01 — CRÍTICO: Handlers de order usam `event.context.auth` inexistente

- **Tipo**: Bug (quebra total)
- **Severidade**: **Crítica**
- **Confiança**: Alta
- **Arquivo**: `server/api/orders.post.ts:5-6`, `server/api/orders/[id].get.ts:5-6`, `server/api/orders/[id]/complete.post.ts:5-6`, `server/api/orders/[id]/cancel.post.ts:5-6`
- **Evidência**: Todos handlers fazem `const auth = event.context.auth` e `const { companyId } = auth.session`. Middleware `auth.ts` (linha 150-153) seta `event.context.user`, `event.context.session`, `event.context.tenantId`, `event.context.userId` — **NÃO seta `event.context.auth`**. Handlers de auth (companies, invites) usam corretamente `event.context.user`/`session`.
- **Impacto**: **Todos endpoints de order (create, get, complete, cancel) retornam 401 "unauthenticated"** — funcionalidade totalmente quebrada.
- **Correção**:
  1. Opção A (mínima): Mudar handlers para usar `event.context.user` e `event.context.session` (como auth handlers)
  2. Opção B (consistente): Adicionar no middleware `event.context.auth = { user: session.user, session: session.session }`
  3. Verificar restaurant/print handlers (mesmo bug — P06-A01, P07-A01)

### P05-A02 — Migration ordering: `round_half_up` criada DEPOIS de `order_item.line_total`

- **Tipo**: Bug (migration)
- **Severidade**: **Alta**
- **Confiança**: Alta
- **Arquivo**: `drizzle/0014_add_order_tables.sql:191` vs `drizzle/0022_round_half_up.sql`
- **Evidência**: Migration 0014 (linha 191) cria `line_total GENERATED ALWAYS AS (round_half_up(unit_price * quantity - discount_applied))`. Migration 0022 cria a função `round_half_up`. Applier roda em ordem numérica → 0014 executa antes de 0022 → **erro "function round_half_up does not exist" em banco limpo**.
- **Impacto**: `pnpm db:migrate:full` falha em CI/produção nova.
- **Correção**: Mover criação de `round_half_up` para migration **antes de 0014** (ex.: `0013_round_half_up.sql`) ou remover generated column da 0014 e adicionar na 0022 após criar função.

### P05-A03 — FSM de order não implementado (spec prevê 7 estados + transições)

- **Tipo**: Bug (funcionalidade ausente)
- **Severidade**: Alta
- **Confiança**: Alta
- **Arquivo**: `specs/consolidated-specs.md:108-125`, `server/utils/order/repository.ts:7-11,187-227`
- **Evidência**: Spec define FSM: `open → confirmed → preparing → ready → completed` + `cancelled` em qualquer estado. Transições inválidas = 422 `invalid_transition`. Repository só implementa `open`/`completed`/`cancelled` (linha 7-11). `complete()` e `cancel()` só permitem transição de `open` (linha 195-197, 216-218). Estados `confirmed`, `preparing`, `ready` não existem.
- **Impacto**: Fluxo de cozinha (KDS) não pode avançar pedido por etapas. Restaurant pack depende disso.
- **Correção**:
  1. Adicionar coluna `status` com todos estados do spec (CHECK constraint)
  2. Implementar métodos `confirm()`, `startPrep()`, `finishPrep()`, `ready()` no repository
  3. Validar transições (state machine) → 422 se inválida
  4. Adicionar timestamps `confirmed_at`, `preparing_at`, `ready_at` opcionais

### P05-A04 — `locationId` não validado contra membership do usuário

- **Tipo**: Segurança / Bug
- **Severidade**: Média
- **Confiança**: Média
- **Arquivo**: `server/api/orders.post.ts:37`, `server/utils/order/repository.ts:87`
- **Evidência**: Handler recebe `body.locationId` e passa direto para repository. Repository usa `withTenant(companyId, locationId, ...)`. **Não valida** se usuário é membro da company E se location pertence à company. Usuário malicioso pode passar `locationId` de outro tenant? RLS bloqueia (company_id mismatch), mas location_id de outra company do mesmo usuário? Não validado.
- **Impacto**: Usuário pode criar pedido em location que não pertence à company (se tiver acesso a múltiplas companies). RLS company-scoped bloqueia cross-company, mas cross-location dentro da mesma company permitido (P02-A01).
- **Correção**: Validar `locationId` pertence à `companyId` + usuário tem acesso à location (via membership ou role).

### P05-A05 — Idempotency key: handler exige mas não valida formato/unicidade além do DB

- **Tipo**: Bug (validação)
- **Severidade**: Baixa
- **Confiança**: Alta
- **Arquivo**: `server/api/orders.post.ts:42`, `server/utils/order/repository.ts:88-97`
- **Evidência**: Spec linha 134: "Criação de `order` **exige** header `Idempotency-Key`". Handler lê `body.idempotencyKey` (não header!). Repository faz `SELECT ... WHERE company_id = ? AND idempotency_key = ?` → retorna existing se encontrado. **Porém**: handler não valida se header presente, não valida formato (UUID?), não retorna header `Idempotency-Key` no response.
- **Impacto**: Cliente pode omitir → repo cria duplicado (unique index `order_company_idempotency_key_idx` falha → 409). Body vs header inconsistency.
- **Correção**: Ler de header `event.headers.get('idempotency-key')`, validar UUID, retornar no response.

### P05-A06 — `order_item.line_total` generated column usa `round_half_up` mas schema TS define `lineTotal` como generated (OK)

- **Tipo**: Bug (schema drift)
- **Severidade**: Baixa
- **Confiança**: Alta
- **Arquivo**: `server/utils/schema/order-item.ts:32-34` vs `drizzle/0014_add_order_tables.sql:191`
- **Evidência**: Schema TS usa `.generatedAlwaysAs(sql`round_half_up(...)`)` — coincide com migration. **Porém** migration 0022 recria a função e a coluna (drop/add). Schema TS não atualizado para refletir drop/recreate.

### P05-A07 — `party` table: `customer_id` e `party_id` ambos FK para `party` (confuso)

- **Tipo**: Design / Data model
- **Severidade**: Baixa
- **Confiança**: Média
- **Arquivo**: `server/utils/schema/order.ts:21-22`, `specs/consolidated-specs.md:87-88`
- **Evidência**: Spec: `customer_id` (nullable, FK → party.id) + `party_id` (nullable, FK → party.id — cliente OU fornecedor). Dois campos para mesma tabela com semântica diferente. Handler `orders.post.ts` aceita ambos (`body.customerId`, `body.partyId`). Repository passa ambos.
- **Impacto**: Confusão semântica. `customer_id` = cliente do pedido; `party_id` = parte genérica (cliente/fornecedor). Para restaurant, `customer_id` faz sentido. Para wholesale, `party_id` como fornecedor.
- **Correção**: Documentar diferença ou unificar com campo `type` em party.

### P05-A08 — `orderRepository.list` faz N+1 query (enrichOrder por row)

- **Tipo**: Performance
- **Severidade**: Baixa
- **Confiança**: Alta
- **Arquivo**: `server/utils/order/repository.ts:229-251`
- **Evidência**: `list()` faz `findMany` orders → loop `for (const row of rows)` → `enrichOrder(tx, row)` que faz 3 queries extras por order (items, dine_in, takeout). Para 50 orders = 150+ queries.
- **Impacto**: Latência alta em listagem. Aceitável para p50 < 100ms com poucos itens, mas não escala.
- **Correção**: Usar `withTenant` + query com joins ou batch loading (Drizzle `findMany` com `with` relations se suportado).

---

## Pontos Fortes

- **Idempotency no DB**: Unique index `(company_id, idempotency_key)` + repository check → 409 se duplicado
- **Snapshot rule**: `order_item` guarda `product_name`, `unit_price`, `tax_snapshot`, `bom_snapshot`, `discount_applied` — edição de produto não reescreve histórico
- **`line_total` generated column**: Cálculo no DB (`round_half_up(unit_price * quantity - discount_applied)`) — consistente
- **`withTenant` em todas queries**: RLS backstop company_id + location_id + user_id
- **Transação única no create**: Company + location + order + items + satellite (dine_in/takeout) atomicamente
- **Soft-delete não usado**: Order usa status `cancelled` (não `is_deleted`) — correto para auditoria fiscal

---

## Sinais para Roadmap

- **P0 (bloqueador)**: Fix `event.context.auth` bug (P05-A01) — **quebra todos endpoints**
- **P0 (bloqueador)**: Fix migration ordering `round_half_up` (P05-A02, P02-A03) — **quebra migrate limpo**
- **P0 (bloqueador)**: RLS location-scoped (P02-A01) — order, order_item, product, restaurant_table precisam `get_location_id()`
- **P1**: Implementar FSM completo (confirmed, preparing, ready) + validação transições
- **P1**: Validar `locationId` contra membership
- **P2**: Otimizar `list()` N+1 com batch loading
- **P2**: Idempotency key via header (não body) + response header

---

## Não Verificado / Dúvidas

- `order_takeout.pickup_at` timezone handling (timestamptz OK)
- `party.type` enum não validado no schema (`customer` | `supplier`)
- `restaurant_table.current_order_id` não FK (text) — pode ficar órfão
- Tests para order repository (`repository.spec.ts`/`repository.test.ts` existem mas não rodados)

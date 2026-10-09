# Parte 2: Banco/Schema/Migrations/RLS — Relatório de Revisão

## Escopo

- `drizzle/` — 23 migrations (0000–0022)
- `server/utils/schema/` — 19 tabelas (identity, company, invite, security, order, order-item, order-dine-in, order-takeout, printer, print-job, location, party, product, restaurant-table, kitchen-station, kitchen-ticket, cashier-shift, payment)
- `server/utils/db/` — `db.ts`, `tenant-context.ts`, `tenant-context.test.ts`
- Testes RLS: `00-rls-canary.test.ts`, `tenant-isolation-concurrent.test.ts`, `grants-parity.test.ts`

---

## Veredito

| Critério             | Status | Justificativa                                                                                                                                                                                                                                                                                          |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R1 — Bugs/Falhas** | ❌     | Falta `get_location_id()` function (spec exige RLS location-scoped); `round_half_up` function drop/recreate na migration 0022 quebra coluna gerada se já existir; parser SQL custom pode falhar em `DO $$` blocks; `line_total` generated column usa função que pode não existir no momento da criação |
| **R2 — Segurança**   | ⚠️     | RLS bem implementado com fail-closed via GUCs; grants parity testado; role split (merp/merp_app) correta; DEFAULT PRIVILEGES para tabelas futuras; **MAS** location-scoped RLS ausente (apenas company-scoped) — vazamento potencial entre locations do mesmo tenant                                   |

---

## Achados

### P02-A01 — CRÍTICO: Função `get_location_id()` não existe (RLS location-scoped ausente)

- **Tipo**: Segurança / Bug
- **Severidade**: **Crítica**
- **Confiança**: Alta
- **Arquivo**: `drizzle/` (todas migrations), `specs/consolidated-specs.md:130`
- **Evidência**: Spec linha 130 exige `Policy: company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)`. Migrações 0014, 0015, 0016 usam apenas `company_id = get_tenant_id()`. Função `get_tenant_id()` e `get_user_id()` existem (0005), mas **não há `get_location_id()`**.
- **Impacto**:
  1. Usuário com acesso a uma location vê dados de **todas locations** do mesmo company (viola isolamento location-scoped)
  2. Pedidos, mesas, produtos, impressoras, kitchen tickets não são filtrados por location
  3. Attacker autenticado em location A acessa dados de location B via API (ex.: `GET /api/orders` com tenant=company_id)
- **Cenário de ataque (3 passos)**:
  1. Usuário legitimo loga na empresa X, location A (recebe session com `activeCompanyId`=X)
  2. Faz request para `GET /api/orders` — handler usa `withTenant(companyId, locationId, ...)` mas RLS só filtra por `company_id`
  3. Retorna pedidos de **todas locations** da empresa X (location B, C, etc.) — vazamento cross-location
- **Correção**:
  1. Criar migration `0023_get_location_id.sql`: `CREATE OR REPLACE FUNCTION get_location_id() RETURNS text AS $$ SELECT NULLIF(current_setting('app.location_id', true), ''); $$ LANGUAGE SQL STABLE;`
  2. Atualizar **todas** policies RLS de tabelas location-scoped (order, order_item, order_dine_in, order_takeout, product, restaurant_table, kitchen_station, kitchen_ticket, printer, print_job, cashier_shift, party, location) para `USING (company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL))`
  3. Verificar handlers que chamam `withTenant` — todos devem passar `locationId` (não `null`)

### P02-A02 — Migration 0022 drop/recreate `round_half_up` quebra coluna gerada existente

- **Tipo**: Bug (migration)
- **Severidade**: Alta
- **Confiança**: Alta
- **Arquivo**: `drizzle/0022_round_half_up.sql:4-8`
- **Evidência**:
  ```sql
  ALTER TABLE order_item DROP COLUMN IF EXISTS line_total;
  DROP FUNCTION IF EXISTS round_half_up(numeric);
  CREATE OR REPLACE FUNCTION round_half_up(v numeric) RETURNS numeric(12,2) ...
  ALTER TABLE order_item ADD COLUMN line_total ... GENERATED ALWAYS AS (round_half_up(...))
  ```
  Se rodar em banco que já tem a coluna + função, o `DROP COLUMN` remove a coluna gerada, mas o `DROP FUNCTION` falha se houver dependências (outras tabelas usando). Ordem errada: deveria dropar função DEPOIS de remover todas colunas dependentes.
- **Impacto**: `db:migrate:full` falha em banco limpo se ordem de aplicação não for respeitada, ou deixa coluna sem generated column se parcialmente aplicado.
- **Correção**: Reordenar — dropar TODAS colunas geradas que usam a função ANTES de dropar a função, ou usar `CASCADE` no drop function (risco). Melhor: separar em duas migrations (drop cols → drop fn → create fn → add cols).

### P02-A03 — `line_total` generated column usa `round_half_up` antes da função existir (ordem migrations)

- **Tipo**: Bug (migration ordering)
- **Severidade**: Alta
- **Confiança**: Média
- **Arquivo**: `drizzle/0014_add_order_tables.sql:191` vs `drizzle/0022_round_half_up.sql`
- **Evidência**: Migration 0014 (linha 191) cria `line_total GENERATED ALWAYS AS (round_half_up(unit_price * quantity - discount_applied))` mas `round_half_up` só é criada na 0022. O applier roda em ordem numérica (0014 antes de 0022) → **falha em banco limpo** com "function round_half_up does not exist".
- **Impacto**: `pnpm db:migrate:full` falha em banco limpo (CI/produção nova).
- **Correção**: Mover criação de `round_half_up` para **antes** de 0014 (ex.: 0013_round_half_up.sql) ou remover generated column da 0014 e adicionar na 0022 após criar a função.

### P02-A04 — Parser SQL custom não trata `DO $$` blocks corretamente

- **Tipo**: Bug (tooling)
- **Severidade**: Média
- **Confiança**: Média
- **Arquivo**: `scripts/apply-custom-sql.ts:5-87`, `drizzle/0014_bootstrap_role_split.sql:8-12`, `drizzle/0017_app_role_core_grants.sql:8-12`, `drizzle/0018_consolidated_auth_security_state.sql:17-23`
- **Evidência**: Migrations usam `DO $$ BEGIN ... END $$;` blocks. Parser `splitStatements` detecta `$$` como dollar quote (linha 68) mas pode falhar se houver `;` dentro do block. Não testei execução real.
- **Impacto**: Migrações com `DO $$` podem ser splitadas incorretamente → statements parciais → erro 500 no apply.
- **Correção**: Validar parser contra migrations atuais ou migrar para `drizzle-kit` + `pg` driver nativo.

### P02-A05 — `company_member` INSERT policy permite self-insert sem validação de role em certos caminhos

- **Tipo**: Segurança
- **Severidade**: Média
- **Confiança**: Média
- **Arquivo**: `drizzle/0014_bootstrap_role_split.sql:12-31`
- **Evidência**: Policy `cm_insert_policy` permite self-insert se:
  - `is_company_owner(company_id)` — OK
  - `user_id = get_user_id() AND company_id = get_tenant_id() AND (allow_founder_bootstrap + role='owner' OR allow_member_bootstrap + role='member' OR invite token válido)`
  - **Gap**: Se `allow_member_bootstrap=true` e attacker seta `role='owner'` no payload, a policy permite? **Não** — checa `role = 'member'` explicitamente. Mas se `allow_founder_bootstrap=true` (criação de empresa), o handler `companies.post.ts` deve setar a flag — confirmar que só owner bootstrap permite role='owner'.
- **Impacto**: Se handler bugar e setar flag errada, membro vira owner.
- **Correção**: Adicionar check `role IN ('owner','member')` na policy (defesa em profundidade) e validar handlers.

### P02-A06 — `invite_token_select_policy` permite SELECT por token_hash sem validar expiração

- **Tipo**: Segurança
- **Severidade**: Baixa
- **Confiança**: Alta
- **Arquivo**: `drizzle/0012_invite_token_accept.sql:36-40`, `drizzle/0014_bootstrap_role_split.sql` (substitui)
- **Evidência**: Policy `invite_token_select_policy` usa `token_hash = current_setting('app.invite_token_hash', true)` mas **não checa `expires_at > now()`**. O handler `invites.accept.post.ts` deve validar expiração antes de setar GUC.
- **Impacto**: Se handler pular validação, token expirado permite SELECT do invite (vazamento de email/company_id). Baixo risco pois handler valida.
- **Correção**: Adicionar `AND expires_at > now()` na policy (defesa em profundidade).

### P02-A07 — Tabelas `auth_event`, `auth_security_state`, `email_queue`, `two_factor`, `verification`, `account`, `session`, `user` **não têm RLS** (global tables)

- **Tipo**: Segurança (design)
- **Severidade**: Baixa (intencional)
- **Confiança**: Alta
- **Arquivo**: `specs/consolidated-specs.md:303-310`, `drizzle/0000_bizarre_titania.sql`, `drizzle/0018_consolidated_auth_security_state.sql`
- **Evidência**: Spec linha 305-310 marca essas tabelas como `RLS: Não (global)`. `auth_security_state` é chaveada por `key` (ex.: `rate:email`, `lockout:email:ip`) — isolamento via chave composta, não RLS.
- **Impacto**: Design correto para tabelas globais de auth. Rate limit/lockout funcionam cross-tenant (intencional: 10 falhas por IP bloqueiam globalmente).
- **Nota**: Confirmar que `auth_event` não vaza PII cross-tenant (logs de auditoria são globais por design).

### P02-A08 — `uniqueIndex` em `invite` usa `companyId + email` mas permite múltiplos convites se email diferente (OK)

- **Tipo**: Bug (data integrity)
- **Severidade**: Baixa
- **Confiança**: Alta
- **Arquivo**: `server/utils/schema/invite.ts:28`, `drizzle/0006_invites_rls.sql:18`
- **Evidência**: `uniqueIndex('invite_company_email_idx').on(table.companyId, table.email)` + constraint `invite_company_email_unique UNIQUE(company_id, email)`. Permite re-convidar mesmo email após aceite (`accepted_at` setado) — partial index `invite_pending_email_idx` só cobre `accepted_at IS NULL`. Correto.

### P02-A09 — `order_item.tax_snapshot` e `bom_snapshot` são `text` (não `jsonb`)

- **Tipo**: Bug (schema drift)
- **Severidade**: Baixa
- **Confiança**: Alta
- **Arquivo**: `server/utils/schema/order-item.ts:27-28` vs `drizzle/0014_add_order_tables.sql:188-189`
- **Evidência**: Schema TS define `text('tax_snapshot')` e `text('bom_snapshot')` mas migration 0014 cria como `text` (não `jsonb`). Spec linha 146-147 diz `jsonb`. Inconsistência schema vs migration vs spec.
- **Impacto**: App pode salvar JSON string em text; query JSON não funciona. Baixo risco se app serializa/deserializa.
- **Correção**: Alinhar: migration para `jsonb` ou schema TS para `text` + documentar.

### P02-A10 — `kitchen_ticket` e `kitchen_station` tabelas não têm RLS na migration 0016

- **Tipo**: Segurança
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `drizzle/0016_restaurant_pack.sql` — só cria `cashier_shift`, não `kitchen_ticket`/`kitchen_station`
- **Evidência**: Schema TS tem `kitchen-ticket.ts` e `kitchen-station.ts` exportados no index, mas migration 0016 só tem `cashier_shift`. Spec `consolidated-specs.md` não menciona kitchen tables.
- **Impacto**: Se tabelas existirem (criadas por `drizzle-kit push`), **não têm RLS** — vazamento total cross-tenant.
- **Correção**: Verificar se tabelas existem no DB (via `drizzle-kit push`). Se sim, criar migration com RLS. Se não, remover do schema TS.

---

## Pontos Fortes

- **RLS Canary + Concurrency tests** — provam isolamento cross-tenant (0 vazamentos em 100 iterações × 20 concorrentes)
- **Grants parity test** — bloqueia CI se `merp_app` falta grants em qualquer tabela/sequence
- **DEFAULT PRIVILEGES** (0020) — grants automáticos para tabelas futuras
- **Role split** (0014/0017) — `merp` (owner/superuser) só para setup/migrações; `merp_app` (NOBYPASSRLS) para runtime
- **Bootstrap flags escopados por role** (0014) — `allow_founder_bootstrap` (owner) vs `allow_member_bootstrap` (member) + invite token
- **Fail-closed GUCs** — `NULL` limpa contexto (não herda outer), `NULLIF(get_*(), '')` mapeia vazio para NULL → RLS nega

---

## Sinais para Roadmap

- **P0** (bloqueador): `get_location_id()` + RLS location-scoped em todas tabelas — **Core Order e Restaurant Pack dependem disso**
- **P0**: Fix migration ordering `round_half_up` antes de `order_item.line_total`
- **P1**: Validar parser SQL custom ou migrar para tool padrão
- **P1**: Verificar existência de `kitchen_ticket`/`kitchen_station` no DB e adicionar RLS se existirem
- **P2**: Alinhar `tax_snapshot`/`bom_snapshot` tipo (text vs jsonb)

---

## Não Verificado / Dúvidas

- Execução real do `apply-custom-sql.ts` contra migrations 0014–0022 (precisa Docker)
- Se `drizzle-kit push` já criou `kitchen_ticket`/`kitchen_station` no DB de dev
- Handlers de order/restaurant passando `locationId` correto no `withTenant` (verificar nas Partes 5-6)
- `party` table RLS — migration 0014 usa `company_id = get_tenant_id()` apenas (sem location)

---
title: 'Database Schema — MERP'
slug: 'database-schema'
category: 'reference'
status: 'active'
version: '1.0.0'
owner: '@docs-maintainer'
reviewers: ['@tech-lead']
module: 'reference'
tags: ['database', 'schema', 'drizzle', 'tables', 'rls']
audience: ['dev', 'qa', 'devops']
created: '2026-10-10'
updated: '2026-10-10'
review-cycle: 'quarterly'
related: []
replaces: []
replaced-by: null
---

# Database Schema — MERP

Visão geral das tabelas do schema Drizzle. Fonte da verdade: `server/utils/schema/index.ts` e migrations em `drizzle/`.

## Convenções

- **PK**: `uuid` nativo para tabelas novas; `text` para tabelas Better Auth legadas (`user`, `session`, `account`, `verification`)
- **RLS**: 17 tabelas operacionais têm RLS **+ `FORCE ROW LEVEL SECURITY`** com policies `company_id` (+ `location_id` onde aplica). Sem RLS (auth/globais): `user`, `session`, `account`, `verification`, `auth_security_state`, `email_queue`
- **Dinheiro**: `numeric(12,2)` com arredondamento half-up por linha (ver `money.md`)
- **Timestamps**: `timestamptz` com `defaultNow()`
- **Soft delete**: Coluna `is_deleted` + `deleted_at` onde aplicável

## Tabelas por Contexto

### Auth (Better Auth + Extensões)

| Tabela           | PK     | Descrição                                           | RLS                                                    |
| ---------------- | ------ | --------------------------------------------------- | ------------------------------------------------------ |
| `user`           | `text` | Usuário (Better Auth core)                          | Global (user-scoped via session)                       |
| `session`        | `text` | Sessão ativa                                        | User-scoped                                            |
| `account`        | `text` | Contas OAuth/email-password                         | User-scoped                                            |
| `verification`   | `text` | Tokens de verificação email/senha                   | User-scoped                                            |
| `company`        | `uuid` | Tenant/empresa                                      | Company-only                                           |
| `company_member` | `uuid` | Membro da empresa (role, default_location_id)       | Company-only                                           |
| `invite`         | `uuid` | Convite para empresa (token hash, expiração)        | Company-only                                           |
| `auth_event`     | `uuid` | Auditoria: login, logout, failed, session lifecycle | RLS + FORCE (`user_id = get_user_id()`, SELECT/INSERT) |

### Core Order (Em Progresso — Spec `specs/006-core-order/`)

| Tabela          | PK          | Descrição                                 | RLS                            |
| --------------- | ----------- | ----------------------------------------- | ------------------------------ |
| `order`         | `uuid`      | Pedido (order_type, status, total_amount) | Company + Location             |
| `order_item`    | `uuid`      | Item do pedido (snapshot preço/tax/bom)   | Company + Location (via order) |
| `order_dine_in` | `uuid` (FK) | Extensão: mesa, cover_count, waiter       | Company + Location             |
| `order_takeout` | `uuid` (FK) | Extensão: pickup_at, pickup_name/phone    | Company + Location             |

### Restaurant Pack (Planeado — Spec `specs/packs/restaurant/`)

| Tabela             | PK     | Descrição                                            | RLS                |
| ------------------ | ------ | ---------------------------------------------------- | ------------------ |
| `location`         | `uuid` | Localização física da empresa                        | Company-only       |
| `restaurant_table` | `uuid` | Mesa (número, capacidade, status, current_order_id)  | Company + Location |
| `kitchen_station`  | `uuid` | Estação de cozinha (display_order, is_active)        | Company + Location |
| `kitchen_ticket`   | `uuid` | Ticket KDS (order_id, station_id, status, priority)  | Company + Location |
| `printer`          | `uuid` | Impressora térmica (driver, connection, station_ids) | Company + Location |
| `print_job`        | `uuid` | Job de impressão (content, status, attempts)         | Company + Location |
| `cashier_shift`    | `uuid` | Turno de caixa (float, reconciliation, status)       | Company + Location |
| `party`            | `uuid` | Customer/Supplier (name, type, document)             | Company + Location |
| `product`          | `uuid` | Produto (sku, unit_price, tax_rule_id)               | Company + Location |

### Fiscal/Financeiro (Futuro)

| Tabela                 | PK     | Descrição                                | Status   |
| ---------------------- | ------ | ---------------------------------------- | -------- |
| `payment`              | `uuid` | Pagamento (amount, method, provider_ref) | Planeado |
| `fiscal_document`      | `uuid` | NFC-e/SAT/NF-e (chave, xml, status)      | Planeado |
| `fiscal_document_item` | `uuid` | Item do documento fiscal (snapshot)      | Planeado |

## RLS Policies (Resumo)

Tabelas tenant-scoped usam policies **por operação** (o Drizzle `db` só tem `SELECT`, o `ownerDb` também escreve):

```sql
-- Padrão real (drizzle/0024 + 0025): tabela location-scoped
-- NOTA: o location-scoped permite qualquer location do tenant quando a GUC
-- de location não está setada (fail-closed só no nível do tenant — ADR-002).
CREATE POLICY product_select ON product FOR SELECT TO merp_app
  USING (company_id = get_tenant_id()
     AND (location_id = get_location_id() OR get_location_id() IS NULL));
CREATE POLICY product_insert ON product FOR INSERT TO merp_app
  WITH CHECK (company_id = get_tenant_id()
     AND (location_id = get_location_id() OR get_location_id() IS NULL));
-- + product_update / product_delete (mesmo predicado)

-- Exceções documentadas: company tem company_select_policy (USING = EXISTS membership)
-- e company_insert_policy (WITH CHECK true — requerimento RLS-005);
-- company_member_insert permite bootstrap do próprio membership;
-- tabelas company-scoped sem location (invite, location) usam só get_tenant_id()
-- (location usa id, não location_id); order_dine_in/order_takeout usam EXISTS sobre order.
```

GUCs definidas por `withTenant(tenantId, locationId, userId, fn)` em `server/utils/db/tenant-context.ts` (`app.tenant_id`, `app.location_id`, `app.user_id`); helpers `STABLE` em `public`: `get_tenant_id()`, `get_location_id()`, `get_user_id()`, `is_company_owner(cid)` — todos `NULLIF(current_setting(..., true), '')` (fail-closed).

Catálogo real (matriz tabela × policies): `docs/audit/2026-10-12-auditoria-sql-modeling-rls.md`.

## Migrações

- `drizzle/0000_*.sql` a `drizzle/0021_*.sql` — Journal Drizzle (schema + RLS básico)
- `scripts/apply-custom-sql.ts` — Aplica RLS policies custom + grants (idempotente)
- `npm run db:migrate:full` roda ambos em sequência

## Consultas Úteis

```sql
-- Ver todas as policies RLS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Ver grants para merp_app
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'merp_app' AND table_schema = 'public'
ORDER BY table_name, privilege_type;

-- Ver DEFAULT PRIVILEGES
SELECT * FROM pg_default_acl WHERE defrole = 'merp_app'::regrole;
```

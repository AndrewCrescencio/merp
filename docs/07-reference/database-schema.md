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
- **RLS**: Todas as tabelas operacionais têm RLS habilitado com policies `company_id` + `location_id`
- **Dinheiro**: `numeric(12,2)` com arredondamento half-up por linha (ver `money.md`)
- **Timestamps**: `timestamptz` com `defaultNow()`
- **Soft delete**: Coluna `is_deleted` + `deleted_at` onde aplicável

## Tabelas por Contexto

### Auth (Better Auth + Extensões)

| Tabela           | PK     | Descrição                                           | RLS                              |
| ---------------- | ------ | --------------------------------------------------- | -------------------------------- |
| `user`           | `text` | Usuário (Better Auth core)                          | Global (user-scoped via session) |
| `session`        | `text` | Sessão ativa                                        | User-scoped                      |
| `account`        | `text` | Contas OAuth/email-password                         | User-scoped                      |
| `verification`   | `text` | Tokens de verificação email/senha                   | User-scoped                      |
| `company`        | `uuid` | Tenant/empresa                                      | Company-only                     |
| `company_member` | `uuid` | Membro da empresa (role, default_location_id)       | Company-only                     |
| `invite`         | `uuid` | Convite para empresa (token hash, expiração)        | Company-only                     |
| `auth_event`     | `uuid` | Auditoria: login, logout, failed, session lifecycle | Company-only                     |

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

Todas as tabelas operacionais usam padrão:

```sql
-- Exemplo: company
CREATE POLICY company_isolation ON company
  FOR ALL TO merp_app
  USING (id = current_setting('app.current_company_id')::uuid)
  WITH CHECK (id = current_setting('app.current_company_id')::uuid);

-- Tabelas com location_id:
CREATE POLICY table_isolation ON restaurant_table
  FOR ALL TO merp_app
  USING (company_id = current_setting('app.current_company_id')::uuid
     AND location_id = current_setting('app.current_location_id')::uuid)
  WITH CHECK (company_id = current_setting('app.current_company_id')::uuid
     AND location_id = current_setting('app.current_location_id')::uuid);
```

GUCs definidas por `withTenant(companyId, locationId, userId, fn)` em `server/utils/db/tenant-context.ts`.

## Migrações

- `drizzle/0000_*.sql` a `drizzle/0021_*.sql` — Journal Drizzle (schema + RLS básico)
- `scripts/apply-custom-sql.ts` — Aplica RLS policies custom + grants (idempotente)
- `pnpm db:migrate:full` roda ambos em sequência

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

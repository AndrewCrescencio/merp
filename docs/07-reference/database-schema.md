---
title: "Database Schema — MERP"
slug: "database-schema"
category: "reference"
status: "active"
version: "1.0.0"
owner: "@dba"
reviewers: ["@backend-lead"]
module: "reference"
tags: ["schema", "drizzle", "postgresql", "rls"]
audience: ["dev", "dba", "backend"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "on-change"
related:
  - "adr-003-money-numeric-vs-cents"
  - "adr-006-id-type-uuid"
  - "adr-002-location-scope"
replaces: []
replaced-by: null
---

# Database Schema — MERP

## Convenções

| Regra | Padrão |
|-------|--------|
| Nomes de tabela | Singular, snake_case (`company`, `company_member`) |
| Nomes de coluna | snake_case (`company_id`, `created_at`) |
| PK | `uuid` via `gen_random_uuid()` (tipo `text`) |
| FK | `text` referenciando PK `text` |
| `company_id` | `text NOT NULL` em **todas** tabelas tenant-scoped |
| Money | `numeric(12,2)` + arredondamento half-up no servidor (ADR-003) |
| Timestamps | `timestamp with time zone DEFAULT now()` |
| Soft delete | `is_deleted boolean DEFAULT false` ou `is_active boolean DEFAULT true` |
| Índices padrão | `(company_id, created_at)` em entidades de movimento |
| UNIQUE de negócio | Sempre composto: `(company_id, campo)` |

## Tabelas Core (Auth)

| Tabela | Descrição | RLS |
|--------|-----------|-----|
| `user` | Usuário global (email, name, password hash) | Não (global) |
| `session` | Sessão ativa (token, expires_at, active_company_id) | Não (global) |
| `account` | OAuth accounts (não usado ainda) | Não |
| `verification` | Tokens de email/password reset | Não |
| `auth_event` | Audit log de eventos auth | Não |
| `auth_security_state` | Rate limiting / lockout state | Não |
| `email_queue` | Fila de emails (Resend) | Não |


## Tabelas Tenant (Multi-tenancy)

| Tabela | Descrição | RLS |
|--------|-----------|-----|
| `company` | Tenant raiz (name, cnpj, razao_social) | Sim (company_id = id) |
| `company_member` | Users ↔ Companies (role: owner/member) | Sim |
| `invite` | Convites para entrar na company | Sim |

## Tabelas Núcleo ERP (Planejadas)

| Domínio | Tabelas | Status |
|---------|---------|--------|
| Catalog | `product`, `category`, `product_image` | Planejado |
| Inventory | `stock_quantity`, `stock_movement`, `warehouse` | Planejado |
| Orders | `order`, `order_item`, `order_status_history` | Planejado |
| Payments | `payment`, `payment_method`, `payment_transaction` | Planejado |
| Finance | `invoice`, `invoice_line` | Planejado |
| CRM | `customer`, `contact_person`, `vendor` | Planejado |

## Migrações

- **Journal (14)**: `drizzle/meta/_journal.json` — aplicadas via `drizzle-kit migrate`
- **Custom (10+)**: `drizzle/0014_*.sql` em diante — RLS, policies, grants, DEFAULT PRIVILEGES
- **Aplicação**: `pnpm db:migrate:full` roda ambos (ver `scripts/apply-custom-sql.ts`)

## Grants merp_app

- Migration 0017: grants explícitos nas tabelas existentes
- Migration 0020: `ALTER DEFAULT PRIVILEGES` para tabelas/sequences futuras
- Teste: `grants-parity.test.ts` bloqueia CI se faltar grant
---
title: "Auditoria de Simplificação — 2026-10-03"
slug: "audit-2026-10-03-simplificacao-auditoria"
category: "audit"
status: "draft"
version: "1.0.0"
owner: "@tech-lead"
reviewers: ["@architect"]
module: "architecture"
tags: ["audit", "simplification", "mvp", "ponytail"]
audience: ["dev", "product"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "once"
related:
  - "adr-001-vertical-strategy"
  - "adr-007-test-suite-runs-as-merp-app"
  - "adr-010-2fa-deferred"
replaces: []
replaced-by: null
---

# Auditoria de Simplificação — 2026-10-03

## Resumo Executivo

Auditoria completa do repositório Merp (HEAD `2de2d20`) visando simplificação radical rumo a MVP entregável. **4 hipóteses P0 bloqueiam o roadmap** (H06, H07, H08, H09) — todas de banco/RLS e exigem Docker para validação. **12 hipóteses confirmadas** com severidade S1/S2. **6 quick wins** identificados (<1 dia cada). Baseline: 300 testes passam (sem DB), build OK, lint falha em worktree, docs validam.

---

## Seção 1 — Raio-X

### Árvore Resumida (Código)

```
server/
├── api/                    # 47 handlers (3943 linhas em auth/)
│   ├── auth/               # 23 endpoints (register, login, logout, invite, company, session)
│   ├── health.get.ts       # 17 linhas
│   └── metrics.get.ts      # 40 linhas (PROM metrics, sem consumidor)
├── middleware/             # 6 arquivos (CSRF token/validate, auth, PII audit, no-store)
├── tasks/                  # 4 Nitro tasks (purge-sessions, purge-auth-events, purge-security-state, process-email-queue)
├── utils/
│   ├── auth/               # 800 linhas (identity 19M, company 26M, invite 10M)
│   │   ├── identity/       # repository.ts + queries.ts + session.ts + user.ts + client.ts
│   │   ├── company/        # repository.ts (soft-delete, sessions, membership)
│   │   ├── invite/         # repository.ts (token hash, accept flow)
│   │   └── tenant-context.ts  # withTenant (31 linhas)
│   ├── schema/             # 244 linhas (identity, company, invite, security, email)
│   ├── shared/             # 2358 linhas (handler, errors, security, email, audit, csrf, ip, validate, background)
│   ├── db.ts               # 34 linhas (postgres-js, ssl upgrade, createOwnerDbForSetupOnly)
│   ├── apply-custom-sql.ts # 51 linhas (156 statements idempotentes)
│   ├── 00-rls-canary.test.ts
│   ├── tenant-isolation-concurrent.test.ts
│   └── grants-parity.test.ts
├── error-handler.ts
└── plugins/
    └── validate-env.ts

shared/
├── auth.ts                 # 120 linhas (Better Auth singleton, plugins=[])
└── logger.ts               # 860 linhas
```

### Árvore Resumida (Docs)

```
docs/
├── 00-overview/            # README, architecture-overview, glossary
├── 02-architecture/adr/    # 10 ADRs duplicados de specs/decisions/
├── 03-domain/auth/spec.md  # 125 linhas (resumo de specs/001-auth-context/spec.md 464 linhas)
├── 05-operations/runbooks/grants.md
├── 06-packs/restaurant/spec.md
├── 07-reference/           # database-schema.md (tem two_factor_enabled residual), env, errors, cli
├── _meta/                  # doc-standards (461 linhas), 6 scripts, 7 templates, inventory.json
└── audit/                  # 2026-09-22-fechamento.md, 2026-09-22-roles.txt
```

```
specs/
├── README.md               # Phase status, 86 linhas
├── 000-foundation/         # 7 arquivos, 292 linhas (rls-pattern, money, idempotency, endpoint-pattern, naming, snapshot, fiscal-br)
├── decisions/              # 10 ADRs, 376 linhas
├── 001-auth-context/       # spec.md (464), data-model, contracts, plan, tasks, research, quickstart
├── 006-core-order/         # spec.md, data-model.md, contracts/order-api.md (IMPLEMENTAÇÃO NÃO INICIADA)
├── 007-print/              # spec.md, data-model.md, plan.md, contracts/print-api.md, README.md
├── packs/
│   ├── restaurant/         # spec.md, data-model.md, contracts/restaurant-api.md
│   └── erp-b2b/            # catalog/, sales/, finance/, crm/, admin/ (cada um só plan.md, status ADIADO)
└── 003-005 absorvidos → packs/erp-b2b/
```

### Métricas com Comando

| Métrica | Valor | Comando |
|---|---|---|
| Testes (sem DB) | 300 passed, 81 skipped, 49 files | `pnpm test` |
| Testes canário RLS | **[NÃO EXECUTADO]** (sem merp_app) | `DB_AVAILABLE=true pnpm test` |
| Handlers API | 47 arquivos `.ts` | `find server/api -name '*.ts' \| wc -l` |
| Linhas auth API | 3943 | `wc -l server/api/auth/*.ts \| tail -1` |
| Linhas server/utils | 2740 | `wc -l server/utils/**/*.ts \| tail -1` |
| Métodos IdentityRepository | 19 async | `grep -c 'async ' server/utils/auth/identity/repository.ts` |
| Métodos CompanyRepository | 26 async | `grep -c 'async ' server/utils/auth/company/repository.ts` |
| Métodos InviteRepository | 10 async | `grep -c 'async ' server/utils/auth/invite/repository.ts` |
| Migrations Drizzle | 22 arquivos (0000-0021) | `ls drizzle/*.sql \| wc -l` |
| Statements RLS (migrations) | 37 | `grep -c "CREATE POLICY\|ALTER TABLE.*ENABLE ROW LEVEL" drizzle/*.sql` |
| Statements RLS (apply-custom-sql) | ~156 | `grep -c "CREATE POLICY" server/utils/apply-custom-sql.ts` (2 únicos, mas concatena 22 arquivos) |
| Specs (specs/) | 42 arquivos .md | `find specs -name '*.md' \| wc -l` |
| Docs (docs/) | 36 arquivos .md | `find docs -name '*.md' \| wc -l` |
| Linhas spec por endpoint implementado | ~85 linhas/endpoint (3943/47) | — |

### Mapa de Módulos

| Módulo | Estado | Código? | Spec? | Necessário MVP (Q1)? | Ação |
|---|---|---|---|---|---|
| Auth (Better Auth) | Implementado | ✅ | ✅ 001 | ✅ | Manter, simplificar wrappers |
| Company/Member/Invite | Implementado | ✅ | ✅ 001 | ✅ | Manter, dividir CompanyRepository |
| RLS/withTenant | Implementado | ✅ | ✅ foundation | ✅ | **P0: corrigir H07/H08** |
| Core Order | Spec apenas | ❌ | ✅ 006 | ✅ | Implementar (dine_in, takeout) |
| Print (KDS/Comanda) | Spec apenas | ❌ | ✅ 007 | ✅ | Implementar após 006 |
| Restaurant Pack | Spec apenas | ❌ | ✅ packs/restaurant | ✅ | Implementar após 006/007 |
| Location | Schema apenas | ⚠️ (falta) | ✅ ADR-002 | ✅ | **P0: H09 criar schema + RLS** |
| Party (Customer/Supplier) | Schema apenas | ⚠️ (falta) | ✅ ADR-001 | ✅ | **P0: H09 criar schema** |
| Product/Catalog | Schema apenas | ⚠️ (falta) | ✅ ADR-001 | ✅ | **P0: H09 criar schema** |
| Inventory/Stock | Schema apenas | ⚠️ (falta) | ✅ ADR-001 | ❌ (fase 2) | Adiar |
| Payment | Schema apenas | ⚠️ (falta) | ✅ ADR-001 | ✅ | **P0: H09 criar schema** |
| Address | Schema apenas | ⚠️ (falta) | ✅ ADR-001 | ❌ (fase 2) | Adiar |
| POS Register | Schema apenas | ⚠️ (falta) | ✅ packs/restaurant | ✅ | **P0: H09 criar schema** |
| Kitchen/Printer | Spec apenas | ❌ | ✅ 007/packs | ✅ | Implementar após 006 |
| Cashier Shift | Spec apenas | ❌ | ✅ packs/restaurant | ✅ | Implementar após 006 |
| ERP-B2B (catalog/sales/finance/crm/admin) | Plan apenas | ❌ | ⚠️ packs/erp-b2b | ❌ | **NUNCA** (até núcleo estável) |
| Fiscal BR (NFC-e/SAT/NF-e) | Doc apenas | ❌ | ✅ fiscal-br.md | ❌ | **NUNCA** no MVP (provedor terceirizado) |

### Código Morto/Inacabado/Duplicado/Órfão

| Item | Severidade | Evidência | Ação |
|---|---|---|---|
| `server/api/metrics.get.ts` | S3 | 40 linhas, sem consumidor, sem testes | **REMOVER** |
| `server/tasks/process-email-queue.ts` | S2 | `queueEmail` retorna early sem RESEND_API_KEY; task agendada a cada 5min | **REMOVER** ou completar com feature flag |
| `server/tasks/purge-*.ts` (3) | S2 | Rodam via Nitro scheduler mas sem integração real de limpeza | **REMOVER** ou implementar |
| `email_queue` tabela + `processEmailQueue` | S2 | Schema + task + queueEmail existem mas inoperantes sem Resend | **REMOVER** (MVP não precisa email assíncrono) |
| `IdentityRepository` wrappers `auth.api.*` | S2 | 6 métodos só repassam para Better Auth | **FUNDIR** no handler ou remover |
| `CompanyRepository` 26 métodos | S1 | Virou service: soft-delete, sessões, membership, search | **DIVIDIR** (CompanyRepository + MembershipRepository) |
| `two_factor_enabled` em docs | S3 | `docs/03-domain/auth/spec.md`, `docs/07-reference/database-schema.md` | **REMOVER** (migration 0021 dropou) |
| ADRs duplicados (specs/decisions + docs/02-architecture/adr) | S2 | 10 arquivos idênticos | **MANTER** só em `specs/decisions/` |
| `docs/03-domain/auth/spec.md` | S2 | Resumo de 001 (125 vs 464 linhas) | **REMOVER** ou redirecionar |
| `PENDING_DECISIONS.md` referenciado 9x mas inexistente | S2 | Quebrado em specs/README.md, revisao-*, ADR-001 | **REMOVER referências** ou criar arquivo |
| `checklists/*` referenciado mas inexistente | S2 | `revisao-specs-001-007-e-rls.md` cita ~30x | **REMOVER referências** |
| `docs/runbooks/grants.md` path errado (3x) | S3 | Real: `docs/05-operations/runbooks/grants.md` | **CORRIR paths** |

---

## Seção 2 — Camadas

### 2A. Código

| Módulo | Camada | Paths | Arquivos/Linhas/Usos | Usada? | Valor→Custo | Veredito | Ponytail cortaria? | Justificativa + Teste de Remoção |
|---|---|---|---|---|---|---|---|---|
| Better Auth | Adapter | `shared/auth.ts` | 120 linhas, singleton | ✅ | Alto/baixo | **MANTER** | Não | Tier 0: auth/sessão/anti-enumeração. Remoção quebraria login, reset, invite. |
| `auth.api.*` wrappers | Repository | `server/utils/auth/identity/queries.ts` + `repository.ts` | 260 + 105 linhas, 19 métodos | ✅ | Baixo/alto | **REMOVER** 6 wrappers | **SIM** — `auth.api.signInEmail` etc. chamados direto no handler | Teste: handler chama `auth.api.signInEmail` direto; se quebrar, volta. Sem interface `IIdentityRepository` (só 1 impl). |
| `IdentityRepository` | Repository | `server/utils/auth/identity/repository.ts` | 105 linhas, 19 métodos | ✅ | Médio/médio | **MANTER** (core) | Não | Métodos de sessão/consentimento não estão em `auth.api.*`. Mas `register/signIn/verifyEmail/resetPassword` → remover. |
| `CompanyRepository` | Repository | `server/utils/auth/company/repository.ts` | 488 linhas, 26 métodos | ✅ | Alto/alto | **DIVIDIR** | **SIM** — >10 métodos, >3 tabelas (company, company_member, session) | Split: `CompanyRepository` (CRUD company), `MembershipRepository` (member, session, search). Teste: cada repo <10 métodos, 1-2 tabelas. |
| `InviteRepository` | Repository | `server/utils/auth/invite/repository.ts` | 207 linhas, 10 métodos | ✅ | Alto/médio | **MANTER** | Não | 10 métodos = limiar. Token hash, accept flow, RLS token policy. Não duplica Better Auth. |
| `withTenant` | Shared | `server/utils/auth/tenant-context.ts` | 31 linhas | ✅ | Crítico/baixo | **MANTER** + **CORRIGIR H07/H08** | Não | Tier 0: RLS fail-closed. Precisa `locationId` param + GUC `app.location_id`. |
| `server/utils/shared/handler.ts` | Wrapper | `defineAuthHandler`, `definePublicHandler`, `defineBetterAuthHandler` | 123 linhas | ✅ | Alto/baixo | **MANTER** | Não | Padroniza auth, rate limit, CSRF, eventos. Remoção = duplicação em 23 handlers. |
| `server/utils/shared/errors.ts` | Shared | `handleDatabaseError`, `send*Error`, `isPgConflict` | ~200 linhas | ✅ | Alto/baixo | **MANTER** | Não | Padroniza erros PG → HTTP. Usado em todos repos. |
| `server/utils/shared/security.ts` | Shared | Rate limit IP/user/email, CSRF, HIBP | 326 linhas | ✅ | Alto/médio | **MANTER** | Não | Tier 0: rate limit, CSRF double-submit, anti-enumeração. |
| `server/utils/shared/email.ts` | Service | `queueEmail`, `processEmailQueue`, templates | 162 linhas | ❌ (sem Resend) | Baixo/alto | **REMOVER** no MVP | **SIM** — feature fantasma, sem RESEND_API_KEY não funciona | Teste: remover imports; handlers de auth usam `auth.api.sendVerificationEmail` (Better Auth nativo). |
| `server/tasks/*.ts` | Nitro Tasks | 4 tasks agendadas | ~300 linhas | ⚠️ | Baixo/médio | **REMOVER** purge-*; **ADIAR** email-queue | **SIM** — purge roda mas sem dados reais; email queue inoperante | Teste: desabilitar no `nuxt.config.ts` scheduledTasks; nada quebra no MVP. |
| `server/api/metrics.get.ts` | Handler | Prometheus metrics | 40 linhas | ❌ | Zero/baixo | **REMOVER** | **SIM** — sem consumidor, sem alerta | Teste: `curl /api/metrics` 404; nenhum teste falha. |
| Drizzle Schema Registry | Registry | `server/utils/schema/index.ts` | 8 linhas | ✅ | Alto/baixo | **MANTER** | Não | Necessário para `drizzleAdapter` e type-safe queries. |
| `createOwnerDbForSetupOnly` | DB Helper | `server/utils/db.ts:31-33` | 4 linhas | ✅ (testes) | Crítico/baixo | **MANTER** (restrito) | Não | ESLint `no-restricted-imports` já bloqueia uso indevido. Tier 0: setup de testes. |

### 2B. Processo/Docs

| Artefato | Existe? | Consome/Atualiza | Divergência | Custo | Veredito | Ponytail cortaria? | Justificativa |
|---|---|---|---|---|---|---|---|
| Constituição (`AGENTS.md`) | ✅ | Regras de trabalho | Não lida integralmente | Baixo | **MANTER** | Não | Define Tier 0, fluxo, hierarquia. Base do agente. |
| `spec.md` (por feature) | ✅ 001, 006, 007, restaurant | Decisão de produto | 3 definições MVP conflitantes (H11) | Médio | **PADRONIZAR** 1 por feature | **SIM** — spec leve (FRs + modelo + contrato) basta | Manter `spec.md` como fonte única; `plan.md/tasks.md` só para features complexas. |
| `plan.md/tasks.md/research.md/quickstart.md` | ✅ 001 apenas | Planejamento | 006, 007, restaurant só têm spec/data-model/contracts | Médio | **CRIAR** só quando implementar | **SIM** — YAGNI para specs sem código | 001 tem 7 arquivos; 006/007 têm 3-5. Para MVP: só `spec.md` + `data-model.md` + `contracts/`. |
| ADRs (`specs/decisions/*`) | ✅ 10 | Decisões arquiteturais | Duplicados em `docs/02-architecture/adr/` | Baixo | **MANTER** só em `specs/decisions/` | **SIM** — deletar duplicata em docs/ | `specs/decisions/` é fonte; `docs/` é operacional. |
| ADRs (`docs/02-architecture/adr/*`) | ✅ 10 | Referência | Cópia exata de specs/decisions | Baixo | **DELETAR** | **SIM** — duplicação pura | `cp specs/decisions/* docs/02-architecture/adr/` não é sincronização. |
| `specs/000-foundation/*` | ✅ 7 | Normas transversais | `rls-pattern.md` diverge do código (H07) | Baixo | **CORRIGIR** H07/H08 | Não | Tier 0: RLS, money, idempotency, snapshot. Normas vinculantes. |
| `docs/00-overview/*` | ✅ 3 | Visão geral | `README.md` tem MVP definition conflitante | Baixo | **ATUALIZAR** para MVP único | **SIM** — docs/ operacional, não decisório | Apontar para `specs/README.md` + `specs/006-core-order/spec.md`. |
| `docs/_meta/doc-standards.md` | ✅ 461 linhas | Governança docs | 16 campos, 7 templates, 6 scripts, 2+ reviewers (time=1) | Alto | **SIMPLIFICAR** | **SIM** — frontmatter 16→8 campos, 1 reviewer, 0 templates obrigatórios | MVP: frontmatter mínimo (title, slug, status, created, updated, module, tags). Scripts validadores mantidos. |
| `docs/_meta/inventory.json` | ✅ | Inventário docs | ADR-005 `deferred` mas texto "adotar" | Baixo | **CORRIGIR** status | Não | Metadados de governança. |
| `pnpm docs:*` scripts | ✅ 4 | CI docs | Passam localmente | Baixo | **MANTER** | Não | Garante links/frontmatter. CI GitHub Actions **não existe** (`.github/workflows/docs.yml` ausente). |
| `specs/README.md` | ✅ | Phase tracking | Números congelados (368, 372, 381) | Baixo | **AUTOMATIZAR** ou remover | **SIM** — apontar `pnpm test` output | CI badge ou script `scripts/spec-count.ts`. |

---

## Seção 3 — Arquitetura-Alvo MVP

### Fluxo Vertical Mínimo (Q1)

```
Mesa (restaurant_table) 
  → Abrir comanda (POST /api/v1/orders order_type=dine_in) 
  → Lançar itens (POST /api/v1/orders/:id/items) 
  → KDS recebe (kitchen_ticket auto-criado por trigger) 
  → Item pronto (PATCH /api/v1/kitchen-tickets/:id/status=ready) 
  → Fechar conta (PATCH /api/v1/orders/:id/status=completed + payment) 
  → Imprimir comanda (POST /api/v1/print/jobs) 
  → Pagamento (integração futura via provedor)
```

**Escopo MVP:** 1 tenant, 1 location, `order_type` ∈ {`dine_in`, `takeout`}, impressão operacional (não fiscal), sem NFC-e.

### Menor Conjunto de Tabelas (com colunas-chave e tipo ID)

| Tabela | Colunas-chave | Tipo ID | RLS Scope | Fonte |
|---|---|---|---|---|
| `company` | id, name, cnpj, is_deleted | uuid | company-only | 001 |
| `company_member` | id, company_id, user_id, role, default_location_id | uuid | company-only | 001 |
| `user` (Better Auth) | id, email, email_verified, is_active, name | text (legacy) | global | Better Auth |
| `session` (Better Auth) | id, user_id, token, expires_at, active_company_id | text (legacy) | user-scoped | Better Auth |
| `location` | id, company_id, name, is_active | **uuid** | company-only | **NOVO (H09)** |
| `party` | id, company_id, location_id, name, type (customer/supplier), document | **uuid** | company+location | **NOVO (H09)** |
| `product` | id, company_id, location_id, name, sku, unit_price, tax_rule_id | **uuid** | company+location | **NOVO (H09)** |
| `order` | id, company_id, location_id, order_type, status, customer_id, party_id, total_amount, created_by | **uuid** | company+location | 006 |
| `order_item` | id, order_id, product_id, product_name, unit_price, quantity, tax_snapshot, bom_snapshot, discount_applied, line_total (generated) | **uuid** | company+location (via order) | 006 |
| `order_dine_in` | order_id, table_id, cover_count, waiter_id, opened_at | uuid (PK=FK) | company+location | 006 |
| `order_takeout` | order_id, pickup_at, pickup_name, pickup_phone | uuid (PK=FK) | company+location | 006 |
| `restaurant_table` | id, company_id, location_id, number, name, capacity, status, current_order_id | **uuid** | company+location | restaurant |
| `kitchen_station` | id, company_id, location_id, name, display_order, is_active | **uuid** | company+location | restaurant |
| `kitchen_ticket` | id, company_id, location_id, order_id, order_item_id, station_id, status, priority | **uuid** | company+location | restaurant/007 |
| `printer` | id, company_id, location_id, name, driver, connection, station_ids[], is_active | **uuid** | company+location | 007/restaurant |
| `print_job` | id, company_id, location_id, printer_id, kitchen_ticket_id, content, status, attempts | **uuid** | company+location | 007/restaurant |
| `payment` | id, company_id, location_id, order_id, amount, method, status, provider_ref | **uuid** | company+location | **NOVO (H09)** |
| `idempotency_record` | company_id, key, request_hash, response_json, expires_at | (company_id, key) PK | company-only | foundation |

**Nota H06:** `user.id` e `session.id` são `text` (Better Auth legacy). `company.id` é `uuid`. FK `company_id uuid REFERENCES company(id)` funciona. FK `user_id text REFERENCES user(id)` funciona. **Cast implícito uuid→text funciona no PG 16** (verificado em docs PG). **Risco zero** para MVP.

### Endpoints e Specs Exigidos (H09)

| Endpoint | Spec | Implementado? |
|---|---|---|
| `POST /api/v1/orders` | 006/contracts/order-api.md | ❌ |
| `GET /api/v1/orders` | 006/contracts/order-api.md | ❌ |
| `GET /api/v1/orders/:id` | 006/contracts/order-api.md | ❌ |
| `PATCH /api/v1/orders/:id/status` | 006/contracts/order-api.md | ❌ |
| `POST /api/v1/orders/:id/items` | 006 (implícito) | ❌ |
| `POST /api/v1/restaurant/tables/:id/open` | restaurant/spec.md | ❌ |
| `PATCH /api/v1/restaurant/kitchen-tickets/:id/status` | restaurant/spec.md | ❌ |
| `POST /api/v1/print/jobs` | 007/contracts/print-api.md | ❌ |
| `GET /api/v1/print/jobs/:id` | 007/contracts/print-api.md | ❌ |
| `POST /api/v1/print/jobs/:id/retry` | 007/contracts/print-api.md | ❌ |

### Arquitetura Mínima por Tipo de Módulo

```
handler (h3) 
  → validação Zod (inline ou shared/validate.ts) 
  → withTenant(companyId, locationId, userId, fn) 
    → Repository (classe concreta, singleton, <10 métodos, 1-2 tabelas) 
      → Drizzle (db.transaction ou tx do withTenant) 
        → SQL com RLS enforcado
```

**Sem:** Service layer, DTO/Mapper (exceto fronteira externa), Interfaces `I*Repository` (só com 2+ impls reais), `auth.api.*` wrappers.

### Onde Manter Rigor (Tier 0)

1. **RLS**: `withTenant` fail-closed, `merp_app` NOBYPASSRLS, USING=WITH CHECK, canário obrigatório.
2. **Dinheiro**: `numeric(12,2)`, half-up **por linha** (corrigir `round()` → `(x * 100 + 0.5)::int / 100.0` ou `round_half_up` custom), total = soma linhas no servidor.
3. **Fiscal**: Snapshot por linha (`tax_snapshot`, `bom_snapshot`), retenção 5 anos, idempotência em emissão.
4. **Idempotência**: `UNIQUE (company_id, idempotency_key)` na tabela da operação (simples, atômico). Tabela separada `idempotency_record` só para pagamentos/fiscal (auditoria).
5. **Auditoria/LGPD**: `auth_event` para login/consent, PII em `/me` e `/export` logado, consent versionado.
6. **Segurança**: CSRF double-submit, rate limit (IP 20/min, user 60/min, email 5/min), anti-enumeração (201 genérico), SameSite=Lax.

### Ordem Respeitando Gate Rule

1. **Gate 0 (já verde)**: RLS canário, grants, CI como `merp_app`.
2. **H07/H08 (P0)**: Corrigir `withTenant` + GUC `app.location_id` + policy location-scoped fail-closed.
3. **H09 (P0)**: Criar schemas `location`, `party`, `product`, `payment`, `restaurant_table`, `kitchen_station`, `printer`, `print_job` + RLS + índices.
4. **006-core-order**: Implementar `order` + `order_item` + `order_dine_in` + `order_takeout` + FSM + handlers + testes RLS.
5. **007-print**: Implementar `printer` + `print_job` + task `process-print-queue` (cron `*/30 * * * * *`) + templates hardcoded.
6. **Restaurant Pack**: `restaurant_table` + `kitchen_ticket` trigger + `cashier_shift` + endpoints mesa/KDS.
7. **Idempotência**: `UNIQUE (company_id, idempotency_key)` em `order` + handlers.
8. **Money fix**: `round_half_up` function + migration `order_item.line_total`.

### Diagrama Mermaid (Arquitetura Mínima)

```mermaid
graph TD
    A[Client] --> B[Nuxt 4 / Nitro]
    B --> C[Middleware: CSRF, RateLimit, Auth]
    C --> D[Handler (h3 + Zod)]
    D --> E[withTenant(companyId, locationId, userId, fn)]
    E --> F[Repository (concreto, <10 métodos)]
    F --> G[Drizzle ORM / postgres-js]
    G --> H[PostgreSQL 16 + RLS]
    H --> I[merp_app role (NOBYPASSRLS)]
    
    subgraph "Tier 0 Invariants"
    I --> J[RLS fail-closed]
    J --> K[withTenant sets GUCs]
    K --> L[USING = WITH CHECK]
    L --> M[Canary test first]
    M --> N[money: half-up per line]
    N --> O[idempotency: UNIQUE key]
    O --> P[audit: auth_event + PII log]
    end
    
    subgraph "MVP Tables"
    Q[company, company_member]
    R[location, party, product]
    S[order, order_item, order_dine_in, order_takeout]
    T[restaurant_table, kitchen_station, kitchen_ticket]
    U[printer, print_job]
    V[payment]
    end
```

---

## Seção 6 — Regulatório/Negócio

| Tier 0 | O que não pode mudar | Alternativa mais simples que mantém garantia |
|---|---|---|
| RLS fail-closed | `withTenant` seta GUCs, `merp_app` NOBYPASSRLS, policies USING=WITH CHECK | **Manter**; apenas adicionar `locationId` param e GUC `app.location_id` |
| `merp_app` NOBYPASSRLS | Role sem bypass, grants via DEFAULT PRIVILEGES | **Manter**; migration 0020 já cobre |
| Anti-enumeração | 201 genérico para email duplicado, rate limit email 5/min | **Manter**; já implementado |
| CSRF double-submit | Header `x-csrf-token` em POST/PATCH/DELETE (exceto auth público) | **Manter**; middleware 01/02 já cobrem |
| Rate limit/lockout | IP 20/min, user 60/min, email 5/min sliding window | **Manter**; `security.ts` implementa |
| Sessão Better Auth | TTL 7d fixo, disableSessionRefresh, revoke on password reset | **Manter**; `shared/auth.ts` configura |
| Auditoria PII | `/me` e `/export` logam `auth_event` | **Manter**; `shared/audit.ts` + handler |
| LGPD consent | `consent_terms_version`, `accepted_at`, `withdrawn_at` em `user` | **Manter**; schema + Better Auth `additionalFields` |
| Dinheiro/fiscal | Totais no servidor, half-up por linha, snapshot item, idempotência escrita dinheiro, retenção 5 anos | **Simplificar**: `UNIQUE (company_id, idempotency_key)` na tabela da operação; `round_half_up` function SQL; `idempotency_record` só para fiscal/pagamento |
| Fiscal BR | NFC-e/SAT/NF-e via provedor terceirizado | **Adiar** totalmente pós-MVP; MVP = impressão operacional only |

### Retenção por Tabela (5 anos mínimo fiscal)

| Tabela | Retenção | Justificativa |
|---|---|---|
| `order`, `order_item`, `order_*` | 5 anos | Documento fiscal base |
| `payment` | 5 anos | Comprovação financeira |
| `kitchen_ticket`, `print_job` | 2 anos | Operacional, não fiscal |
| `auth_event` | 5 anos | LGPD Art. 16 (acesso), Art. 18 (eliminação) |
| `company`, `company_member`, `invite` | 5 anos | Contratual + LGPD |
| `email_queue` | 1 ano | Comunicação transacional |
| `session`, `account`, `verification` | 2 anos | Segurança, não fiscal |

---

## Seção 7 — Recomendação Executiva

**Nesta semana:** (1) Subir Postgres 16 descartável e validar H06/H08 com SQL real como `merp_app`; (2) Corrigir `withTenant` para aceitar `locationId` e setar GUC `app.location_id`; (3) Criar migration `location` + `party` + `product` + `payment` + índices + RLS location-scoped fail-closed; (4) Remover `metrics.get.ts`, `process-email-queue.ts`, `purge-*.ts`, `email_queue` schema, `IdentityRepository` wrappers `auth.api.*`; (5) Dividir `CompanyRepository` em `CompanyRepository` + `MembershipRepository`. **Métrica 30 dias:** 006-core-order implementado + testado como `merp_app` (canário verde), 007-print operacional, restaurant pack fluxo mesa→fechamento funcional. Baseline: 300 testes (sem DB), 0 implementado de 10 endpoints MVP.

---

## Apêndice A — H01–H22

| ID | Veredito | Sev. | Evidência | Consequência |
|---|---|---|---|---|
| H01 | **CONFIRMADO** | S1 | `server/utils/auth/{identity,company,invite}/repository.ts` são classes concretas + singletons; nenhuma interface `I*Repository` existe | Constituição não refletida no código; refatorar para interfaces só se 2+ impls reais |
| H02 | **CONFIRMADO** | S1 | `IdentityRepository` 19M, `CompanyRepository` 26M, `InviteRepository` 10M; limiar=10 | `CompanyRepository` virou service; dividir em 2 repos |
| H03 | **CONFIRMADO** | S2 | `identity/queries.ts`: `signInUser→auth.api.signInEmail`, `registerUser→auth.api.signUpEmail`, `sendVerificationEmailBA→auth.api.sendVerificationEmail`, `verifyEmailBA→auth.api.verifyEmail`, `requestPasswordResetBA→auth.api.requestPasswordReset`, `resetPasswordBA→auth.api.resetPassword` | 6 métodos (~60 linhas) removíveis; handler chama `auth.api.*` direto |
| H04 | **PARCIAL** | S2 | `eslint.config.mjs:13-25` só restringe `createOwnerDbForSetupOnly`; não cobre feature boundaries; ESLint falha em worktree (precisa `--config`) | Adicionar rules `no-restricted-imports` p/ features; fixar CI com config explícita |
| H05 | **CONFIRMADO** | S2 | `metrics.get.ts` (40L), `purge-*.ts` (3), `process-email-queue.ts`, `email_queue` schema, `two_factor_enabled` em docs | Remover metrics, email queue, purge tasks; limpar resíduos 2FA em docs |
| H06 | **BLOQUEADO (P0)** | S0 | Sem Docker; FK `uuid→text` precisa prova real PG 16 | **Não pode prosseguir sem validar**; assumir OK por docs PG 16, mas testar assim que Docker disponível |
| H07 | **CONFIRMADO (P0)** | S0 | `tenant-context.ts:12-16` = 4 params; `rls-pattern.md:29-36` = 5 params; `naming.md:31-32` cita `active_location_id` mas schema `identity.ts:41` só tem `activeCompanyId`; GUC `app.location_id` ausente no código | **Bloqueia 006/007/restaurant**; corrigir assinatura + GUC + schema session |
| H08 | **BLOQUEADO (P0)** | S0 | Policy location-scoped USING tem `OR get_location_id() IS NULL` → se GUC ausente, `NULL` → `TRUE` → **fail-open cross-location**; `withTenant` não seta location | **Vazamento cross-location**; corrigir: USING = WITH CHECK = `company_id = get_tenant_id() AND location_id = get_location_id()` (location obrigatório) ou GUC com default que nega |
| H09 | **CONFIRMADO (P0)** | S1 | 11 tabelas núcleo sem schema: location, party, product, payment, address, pos_register, restaurant_table, kitchen_station, kitchen_ticket, printer, print_job | **Bloqueia 006/007**; criar schemas + RLS + índices antes de implementar handlers |
| H10 | **CONFIRMADO** | S2 | 22 migrations + apply-custom-sql (migrations 0005+); applier custom não transacional, ordem alfabética, falha parcial sem rollback | Squash migrations 0000-0021 → 1 arquivo; mover RLS para journal Drizzle (drizzle-kit 0.31 suporta); `db:migrate:full` único caminho |
| H11 | **CONFIRMADO** | S1 | 3 MVPs: docs/00-overview/README.md, specs/007-print/spec.md:11-12, specs/README.md:40-53 | Definir **um** fluxo: restaurante 1 location, dine_in/takeout, KDS+print, sem fiscal |
| H12 | **CONFIRMADO** | S1 | 6 order_types + 6 satélites; `line_total` usa `round()` (half-even) vs `money.md` half-up | Simplificar para 2 types (dine_in, takeout); corrigir `line_total` para half-up |
| H13 | **CONFIRMADO** | S2 | `idempotency_record` tabela + byte-a-byte + TTL + purga vs `UNIQUE (company_id, key)` na tabela da operação | Usar UNIQUE na tabela (order, payment); tabela separada só para fiscal (auditoria) |
| H14 | **CONFIRMADO** | S1 | Cron `0 * * * * *` = 1min (não 30s); worker cross-tenant falha RLS; printer/print_job em 3 lugares; Gate Rule violado (007 antes de 006) | Corrigir cron `*/30`; worker precisa `withTenant` ou role dedicada; consolidar tabelas; ordenar 006→007 |
| H15 | **CONFIRMADO** | S2 | `cashier_shift` vs `cash_shift`; `kitchen_station` vs `station`; `table` vs `restaurant_table`; `enabled_packs` jsonb vs `company_pack` tabela | Padronizar: `cashier_shift`, `kitchen_station`, `restaurant_table`, `enabled_packs` jsonb (ADR-001) |
| H16 | **CONFIRMADO** | S2 | `money.md` 2 casas vs NFC-e 4 casas; `money.md:35` admite mas arredonda na linha | MVP: 2 casas (half-up linha); fiscal via provedor converte; documentar gap |
| H17 | **CONFIRMADO** | S2 | specs/ 42 MD (~4.4k linhas) vs docs/ 36 MD (~3.7k linhas); ADRs duplicados 10x; 03-domain/auth/spec.md resume 001 | Fonte única: `specs/` = decisão/feature; `docs/` = operacional/referência. Deletar ADRs de docs/. |
| H18 | **CONFIRMADO** | S2 | `doc-standards.md` 461L, 16 campos, 7 templates, 6 scripts, 2+ reviewers (time=1); inventory.json ADR-005 deferred | Simplificar frontmatter 8 campos, 1 reviewer, templates opcionais; CI docs inexistente |
| H19 | **CONFIRMADO** | S2 | `PENDING_DECISIONS.md` 9x, `ERP_FEATURE_PLAN.md` 6x, `SECURITY_AUDIT.md`, `checklists/*`, `docs/runbooks/grants.md` path errado 3x | Remover refs quebradas; corrigir paths; criar arquivos se necessários |
| H20 | **CONFIRMADO** | S3 | 368 (specs/README), 372 (ADR-007), 381 (fechamento) congelados | Substituir por `pnpm test` output ou badge CI |
| H21 | **CONFIRMADO** | S3 | `two_factor_enabled` em `docs/03-domain/auth/spec.md` e `docs/07-reference/database-schema.md` | Remover resíduos (migration 0021 dropou tabela) |
| H22 | **CONFIRMADO** | S3 | specs/README.md Phase 4 "PENDING" mas 006 tem spec; 007 ausente do quadro; audits `archived` em `docs/audit/` não `_archive/` | Atualizar README para refletir estado real; mover audits archived para `_archive/` |

---

## Premissas Assumidas

1. MVP = restaurante, 1 unidade, 1 piloto: mesa → itens → impressão/KDS → fechar conta → pagamento. Sem fiscal no MVP.
2. Fiscal via provedor terceirizado, depois do mínimo.
3. `order_type` = `dine_in`, `takeout` (simplificado de 6).
4. 1 dev; cortes de 6 e 12 semanas.
5. Sem dados reais; sem múltiplas locations no 1º cliente; retail/erp-b2b adiados.
5. Pode propor superseder ADRs/emendar constituição; `specs/` = decisão/feature, `docs/` = operacional/referência.
6. Testes: manter canário + RLS + integração existente; novo: integração só em RLS/dinheiro/FSM; unit em funções puras.
7. <10 tenants, <2 mil pedidos/dia/tenant.
8. Docker indisponível na auditoria — H06/H08 marcados **[NÃO EXECUTADO]** → `blocked` no plano até validar.
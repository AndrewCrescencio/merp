---
title: "Plano de Simplificação — 2026-10-03"
slug: "audit-2026-10-03-simplificacao-plano"
category: "audit"
status: "draft"
version: "1.0.0"
owner: "@tech-lead"
reviewers: ["@architect"]
module: "architecture"
tags: ["audit", "simplification", "mvp", "plan", "ponytail"]
audience: ["dev", "product"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "once"
related:
  - "audit-2026-10-03-simplificacao-auditoria"
  - "adr-001-vertical-strategy"
  - "adr-007-test-suite-runs-as-merp-app"
replaces: []
replaced-by: null
---

# Plano de Simplificação — 2026-10-03

Base: `docs/audit/2026-10-03-simplificacao-auditoria.md`. HEAD `2de2d20`. Branch `main`.

## Tabela de Tarefas

| ID | P | Tipo | Mudança | Arquivos | Esforço/Risco | Verificação | Depende | Commit | Status |
|---|---|---|---|---|---|---|---|---|---|
| T01 | P0 | fix | Validar H06/H08: subir Postgres 16 descartável, rodar SQL Apêndice B/C como `merp_app`, confirmar FK uuid→text e fail-closed location | — | 2h / Baixo | SQL output + canário verde | — | `test(h06): validate uuid-text FK and location fail-closed` | blocked(docker-indisponível) |
| T02 | P0 | fix | Corrigir `withTenant` assinatura: adicionar `locationId` param, setar GUC `app.location_id`, alinhar `rls-pattern.md` | `server/utils/auth/tenant-context.ts`, `specs/000-foundation/rls-pattern.md`, `server/utils/schema/identity.ts` (adicionar `activeLocationId` em session) | 1h / Médio | `pnpm test` (unit), `DB_AVAILABLE=true pnpm test` (canário) | T01 | `fix(rls): withTenant adds locationId + app.location_id GUC` | pending |
| T03 | P0 | feat | Criar schemas núcleo faltantes (H09): `location`, `party`, `product`, `payment`, `restaurant_table`, `kitchen_station`, `printer`, `print_job` + RLS location-scoped fail-closed + índices padrão | `server/utils/schema/location.ts`, `party.ts`, `product.ts`, `payment.ts`, `restaurant-table.ts`, `kitchen-station.ts`, `printer.ts`, `print-job.ts`, `index.ts`, migration Drizzle | 3h / Médio | `pnpm db:migrate:full` (container), `DB_AVAILABLE=true pnpm test` | T02 | `feat(schema): core tables location/party/product/payment + RLS` | pending |
| T04 | P0 | fix | Corrigir `order_item.line_total` para half-up (money.md): criar `round_half_up` SQL function, alterar generated column | migration Drizzle, `specs/000-foundation/money.md` (documentar function) | 1h / Baixo | `pnpm db:migrate:full`, `DB_AVAILABLE=true pnpm test` | T03 | `fix(money): order_item.line_total uses half-up rounding` | pending |
| T05 | P1 | refactor | Remover `IdentityRepository` wrappers `auth.api.*` (6 métodos): handlers chamam `auth.api.*` direto | `server/utils/auth/identity/repository.ts`, `server/utils/auth/identity/queries.ts`, handlers em `server/api/auth/*.ts` | 2h / Baixo | `pnpm test`, `pnpm lint`, `pnpm build` | — | `refactor(auth): remove IdentityRepository auth.api wrappers` | pending |
| T06 | P1 | refactor | Dividir `CompanyRepository` (26M) → `CompanyRepository` (CRUD company, ~6M) + `MembershipRepository` (member/session/search, ~12M) | `server/utils/auth/company/repository.ts` → 2 arquivos, handlers `companies/*.ts` | 2h / Médio | `pnpm test`, `pnpm lint`, `pnpm build` | — | `refactor(company): split CompanyRepository into Company + Membership` | pending |
| T07 | P1 | delete | Remover código morto: `server/api/metrics.get.ts`, `server/tasks/process-email-queue.ts`, `server/tasks/purge-*.ts` (3), `server/utils/schema/email.ts` (email_queue), `server/utils/shared/email.ts` (queueEmail/processEmailQueue) | 7 arquivos + imports em `nuxt.config.ts` (scheduledTasks), `shared/auth.ts` (email callbacks) | 1h / Baixo | `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm db:migrate:full` (drop email_queue) | — | `delete(dead): remove metrics, email queue, purge tasks` | done (1c95a08) |
| T08 | P1 | delete | Limpar resíduos 2FA em docs: remover `two_factor_enabled` de `docs/03-domain/auth/spec.md` e `docs/07-reference/database-schema.md` | 2 arquivos docs | 0.5h / Zero | `pnpm docs:validate`, `pnpm docs:links` | — | `docs: remove 2FA residuals from docs` | done (15681a3) |
| T09 | P1 | delete | Deletar ADRs duplicados em `docs/02-architecture/adr/` (10 arquivos) | `docs/02-architecture/adr/*` | 0.5h / Zero | `pnpm docs:validate`, `pnpm docs:links` | — | `docs: delete duplicate ADRs from docs/02-architecture/adr` | done (188cfcc) |
| T10 | P1 | fix | Corrigir referências quebradas: `PENDING_DECISIONS.md` (9x), `ERP_FEATURE_PLAN.md` (6x), `SECURITY_AUDIT.md`, `checklists/*`, `docs/runbooks/grants.md` → `docs/05-operations/runbooks/grants.md` | `specs/README.md`, `docs/revisao-specs-001-007-e-rls.md`, `specs/decisions/ADR-001-vertical-strategy.md` | 1h / Baixo | `pnpm docs:links` | — | `docs: fix broken references` | done (e7cf53d) |
| T11 | P2 | refactor | Simplificar idempotência: `UNIQUE (company_id, idempotency_key)` em `order` + `payment`; remover `idempotency_record` table spec (manter só para fiscal futuro) | `specs/000-foundation/idempotency.md`, migration `order` + `payment`, handlers | 1h / Médio | `pnpm db:migrate:full`, `DB_AVAILABLE=true pnpm test` | T03 | `refactor(idempotency): unique key on operation tables` | pending |
| T12 | P2 | feat | Implementar 006-core-order MVP: `order` + `order_item` + `order_dine_in` + `order_takeout` + FSM (2 tipos) + 4 handlers + testes RLS | `server/api/v1/orders/*.ts` (4 handlers), repositories, testes | 6h / Alto | `DB_AVAILABLE=true pnpm test` (canário + integração), `pnpm lint`, `pnpm build` | T03, T04 | `feat(order): core order MVP (dine_in, takeout) + FSM + RLS` | pending |
| T13 | P2 | feat | Implementar 007-print MVP: `printer` + `print_job` + task `process-print-queue` (cron `*/30`) + 2 templates hardcoded + 3 handlers | `server/tasks/process-print-queue.ts`, `server/utils/print/templates/*.ts`, `server/api/v1/print/*.ts` | 4h / Médio | `DB_AVAILABLE=true pnpm test`, `pnpm lint`, `pnpm build` | T12 | `feat(print): operational printing MVP (KDS + comanda)` | pending |
| T14 | P2 | feat | Implementar Restaurant Pack fluxo mesa: `restaurant_table` endpoints (open/close), `kitchen_ticket` trigger/status, `cashier_shift` CRUD | `server/api/v1/restaurant/*.ts`, repositories, testes | 4h / Médio | `DB_AVAILABLE=true pnpm test`, `pnpm lint`, `pnpm build` | T12, T13 | `feat(restaurant): table/KDS/cashier flow` | pending |
| T15 | P2 | docs | Atualizar `specs/README.md`: remover números congelados, refletir estado real (006 implementing, 007 pending, restaurant pending), mover audits archived para `_archive/` | `specs/README.md`, `docs/audit/` → `docs/_archive/audit/` | 1h / Baixo | `pnpm docs:validate`, `pnpm docs:links` | — | `docs: update specs/README + archive old audits` | in-progress |
| T16 | P2 | docs | Simplificar `docs/_meta/doc-standards.md`: frontmatter 16→8 campos, 1 reviewer, templates opcionais, remover mkdocs/cspell/markdownlint obrigatórios | `docs/_meta/doc-standards.md`, `docs/_meta/scripts/validate-frontmatter.ts` | 2h / Médio | `pnpm docs:validate`, `pnpm docs:ci` | — | `docs: simplify doc-standards to MVP minimum` | pending |
| T17 | P3 | chore | Squash migrations 0000-0021 → 1 arquivo inicial + RLS no journal Drizzle; tornar `db:migrate:full` = só `drizzle-kit migrate` | `drizzle/*.sql`, `scripts/apply-custom-sql.ts`, `package.json` | 3h / Alto | `pnpm db:migrate:full` (clean DB), `DB_AVAILABLE=true pnpm test` | T03 | `chore(db): squash migrations + RLS in journal` | pending |
| T18 | P3 | chore | Adicionar ESLint `no-restricted-imports` para feature boundaries (ex: `server/utils/auth/identity` não importa `company`) | `eslint.config.mjs` | 1h / Baixo | `pnpm lint` | T04 | `chore(lint): add feature boundary import restrictions` | pending |
| T19 | P3 | chore | Criar `.github/workflows/docs.yml` para CI docs (validate + links + lint) | `.github/workflows/docs.yml` | 0.5h / Baixo | `git push` → Actions passa | — | `ci(docs): add docs validation workflow` | pending |

---

## Quick Wins (<1 dia cada)

| ID | Descrição | Ganho |
|---|---|---|
| T07 | Remover metrics, email queue, purge tasks | -7 arquivos, -600 linhas, -4 scheduled tasks |
| T08 | Limpar 2FA residuals docs | -2 ocorrências, docs limpos |
| T09 | Deletar 10 ADRs duplicados | -10 arquivos, -3.7k linhas duplicadas |
| T10 | Corrigir refs quebradas | `pnpm docs:links` passa limpo |
| T15 | Atualizar specs/README + archive | Estado real documentado |

---

## AGORA (Esta Semana) — P0 Bloqueadores

1. **T01** — Validar H06/H08 (precisa Docker)
2. **T02** — Corrigir `withTenant` + GUC location (desbloqueia T03)
3. **T03** — Criar 8 schemas núcleo + RLS (desbloqueia T04, T12)
4. **T04** — Fix `line_total` half-up

## DEPOIS (Próximas 2 Semanas) — Core MVP

5. **T05** — Remover wrappers `auth.api.*` 
6. **T06** — Dividir `CompanyRepository`
7. **T11** — Simplificar idempotência (UNIQUE key)
8. **T12** — Implementar 006-core-order (dine_in, takeout)
9. **T13** — Implementar 007-print
10. **T14** — Implementar Restaurant Pack fluxo mesa

## NUNCA (Fora do MVP)

- ERP-B2B packs (catalog, sales, finance, crm, admin) — adiados indefinidamente
- Fiscal BR (NFC-e/SAT/NF-e) — provedor terceirizado pós-MVP
- `address`, `pos_register` schemas — fase 2
- `inventory/stock_movement` — fase 2
- `delivery`, `reservation`, `quotation`, `wholesale`, `retail_pos` order_types — fase 2
- Template editor, white-label, Service Worker, WebUSB — fase 3+
- 2FA — feature flag `auth.twoFactor` + migration dedicada + testes RLS (critério ADR-010)

---

## Corte 6 Semanas (Entregável Mínimo)

| Item | Ação | Ganho |
|---|---|---|
| 006-core-order 6 types → 2 types | Remover delivery, retail_pos, wholesale, quotation | -4 tabelas satélite, -FSM complexidade, -handlers |
| Idempotency table → UNIQUE key | Remover `idempotency_record`, usar constraint na tabela | -1 tabela, -código purga/TTL, -complexidade |
| Email queue → removido | MVP usa Better Auth nativo (sendVerificationEmail etc.) | -4 tasks, -schema, -shared/email.ts |
| Purge tasks → removidos | Sem dados reais no MVP; rodar manual se precisar | -3 tasks, -código |
| Metrics endpoint → removido | Sem Prometheus no MVP | -1 handler |
| Doc-standards 461L → ~100L | Frontmatter 8 campos, 1 reviewer | -360 linhas governança |

## Corte 12 Semanas (MVP Completo + Operacional)

| Item | Ação |
|---|---|
| Squash migrations + RLS no journal | `db:migrate:full` = 1 comando, sem applier custom |
| Feature boundary ESLint rules | Impede acoplamento entre features |
| CI docs workflow | Validação automática em PR |
| Testes integração RLS/dinheiro/FSM | Cobertura real Tier 0 |
| `round_half_up` function SQL | Correto monetário |

---

## Riscos de Regressão (com Baseline)

| Risco | Baseline | Mitigação |
|---|---|---|
| `withTenant` change quebra RLS | 300 testes (sem DB), canário **[NÃO EXECUTADO]** | T01 valida com Docker; T02 roda canário + integração |
| Schema changes (H09) quebram auth | `company_member` FKs, `session.activeCompanyId` | Migration order: location/party/product antes de order; testes `grants-parity` |
| `line_total` half-up muda arredondamento | `round()` half-even atual | T04 migration + testes unitários de arredondamento |
| Remoção `IdentityRepository` wrappers | 23 auth handlers usam repo | T05: handlers migram para `auth.api.*` direto; testes `login.post.spec.ts` etc. cobrem |
| Divisão `CompanyRepository` | 10 handlers `companies/*.ts` usam repo | T06: atualizar imports; testes `companies.*.spec.ts` cobrem |
| Remoção email queue | `shared/auth.ts` callbacks usam `queueEmail` | T07: callbacks chamam `auth.api.sendVerificationEmail` nativo (já fazem fire-and-forget) |

---

## Apêndice — Bloqueios

| ID | Bloqueio | Motivo | Resolução |
|---|---|---|---|
| T01 | `blocked(docker-indisponível)` | Docker socket permission denied | Subir Postgres em CI/outro host ou pedir acesso Docker |
| T02 | `blocked(T01)` | Precisa validar GUC behavior com location | Após T01 passar |
| T03 | `blocked(T02)` | RLS location-scoped precisa `app.location_id` funcionando | Após T02 passar |
| T04 | `blocked(T03)` | Migration `order_item` depende de tabela existir | Após T03 passar |
| T12 | `blocked(T03,T04)` | Order precisa schemas + line_total corrigido | Após T03+T04 passar |
| T13 | `blocked(T12)` | Print depende de order + kitchen_ticket | Após T12 passar |
| T14 | `blocked(T12,T13)` | Restaurant pack depende de order + print | Após T12+T13 passar |

---

## Apêndice — Follow-ups (Pós-MVP)

1. **H10 squash migrations** — Mover RLS para journal Drizzle, eliminar `apply-custom-sql.ts` (risco: ordem, idempotência, falha parcial).
2. **H04 feature boundary ESLint** — `no-restricted-imports` entre features (identity↛company, company↛invite, etc.).
3. **H13 idempotency_record para fiscal** — Tabela separada só quando emitir NFC-e/SAT (auditoria fiscal exige response byte-a-byte).
4. **H16 money 4 casas fiscais** — Quando integrar provedor fiscal, `unit_price` `numeric(12,4)` + conversão na emissão.
5. **H22 specs/README automação** — Script `scripts/spec-status.ts` lê `pnpm test` output e atualiza badge/status.

---

## Ponytail Gain (Registro Pós-Execução)

| Bloco | Linhas Removidas | Arquivos Removidos | Camadas Removidas | Notas |
|---|---|---|---|---|
| Quick Wins (T07) | ~540 | 9 | scheduledTasks, email queue, purge tasks, metrics endpoint | metrics, 4 purge tasks, email queue schema + shared + specs |
| Quick Wins (T08-T10) | ~ | ~ | ~ | A ser preenchido após execução |
| Core Refactors (T05-T06) | ~ | ~ | ~ | |
| MVP Implementation (T12-T14) | — | — | — | Adição, não remoção |
| Polish (T15-T19) | ~ | ~ | ~ | |

*Executar `/ponytail-gain` ao final de cada bloco e registrar aqui.*
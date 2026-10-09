# Relatório Consolidado — Merp Review (R1 + R2)

## Veredito Geral

| Critério             | Status         | Resumo                                                                                                                                                                                                                                                                                                                 |
| -------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1 — Bugs/Falhas** | ❌ **CRÍTICO** | 3 bugs críticos que quebram funcionalidade completa: (1) `event.context.auth` não setado no middleware → order/restaurant/print 401; (2) Migration ordering `round_half_up` após `order_item` → migrate limpo falha; (3) `sendToPrinter` stub + templates ESC/POS ausentes → print não funciona. + 11 bugs alta/média. |
| **R2 — Segurança**   | ⚠️ **ALTA**    | 1 crítica (CSRF token não enviado no frontend → páginas pós-login 403), 2 altas (RLS location-scoped ausente, consent withdraw não revoga sessões), + boas práticas sólidas (rate limit, lockout, anti-enumeração, CSRF double-submit, IP spoofing prevention, error handling, PII minimization).                      |

---

## Achados Críticos e Altos (Ordenados por Prioridade)

| ID                                        | Título                                                                  | Severidade  | Área                                       | Correção Resumida                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------- | ----------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **P05-A01 / P06-A01 / P07-A01 / P08-A01** | Middleware não seta `event.context.auth`                                | **CRÍTICA** | Auth Middleware → Order, Restaurant, Print | Adicionar `event.context.auth = { user: session.user, session: session.session }` em `auth.ts:153` |
| **P05-A02 / P02-A03**                     | Migration `round_half_up` após `order_item.line_total`                  | **CRÍTICA** | DB Migrations                              | Mover criação de `round_half_up` para **antes de 0014** (ex.: `0013_round_half_up.sql`)            |
| **P07-A02**                               | `sendToPrinter` é stub (não imprime)                                    | **CRÍTICA** | Print Worker                               | Implementar drivers TCP (`net.Socket`), USB (`usb`), Serial (`serialport`)                         |
| **P07-A03**                               | Templates ESC/POS não existem                                           | **CRÍTICA** | Print Templates                            | Criar `restaurant-kitchen-ticket.ts` + `restaurant-table-comanda.ts` gerando `content` base64      |
| **P02-A01**                               | RLS location-scoped ausente (`get_location_id()` não existe)            | **CRÍTICA** | DB RLS                                     | Criar função `get_location_id()` + atualizar **todas** policies location-scoped                    |
| **P09-A01**                               | Frontend não envia CSRF token (`x-csrf-token`)                          | **CRÍTICA** | Frontend Auth                              | Criar `useApiFetch` composable que lê cookie `merp-csrf_token` e envia header                      |
| **P05-A03**                               | FSM de order não implementado (só open/completed/cancelled)             | **ALTA**    | Core Order                                 | Adicionar estados `confirmed`, `preparing`, `ready` + validação transições 422                     |
| **P04-A01**                               | Consent withdraw não revoga sessões ativas                              | **ALTA**    | Auth/Company                               | Adicionar revogação de sessões no handler `consent/withdraw.post.ts`                               |
| **P06-A02**                               | Tabela `kitchen_ticket` não criada em migration (sem RLS)               | **ALTA**    | Restaurant Pack                            | Adicionar `kitchen_station` + `kitchen_ticket` na migration 0016/0023 com RLS location-scoped      |
| **P03-A01**                               | `searchCompanies` method não existe no `MembershipRepository`           | **ALTA**    | Auth/Company                               | Implementar método no repository (similar a `findUserCompanies` com filtro ILIKE)                  |
| **P05-A04**                               | `locationId` não validado contra membership                             | **MÉDIA**   | Core Order                                 | Validar location pertence à company + user tem acesso                                              |
| **P03-A02**                               | `runTimingPad` cria/revoga sessão fantasma (complexidade desnecessária) | **MÉDIA**   | Auth Login                                 | Simplificar — remover timing pad, confiar no scrypt timing natural                                 |
| **P03-A03**                               | `background` fire-and-forget perde auditoria em serverless              | **MÉDIA**   | Shared/Middleware                          | Documentar limitação; usar `event.waitUntil` ou queue persistente para serverless                  |
| **P07-A04**                               | Task cron 30min vs spec 30s                                             | **MÉDIA**   | Print Worker                               | Loop interno `setInterval(30s)` ou external scheduler                                              |
| **P07-A05**                               | Faltam endpoints GET job status / list queue                            | **MÉDIA**   | Print API                                  | Adicionar `jobs/[id].get.ts` + `jobs.get.ts`                                                       |

---

## Problemas Sistêmicos (Padrões Repetidos)

### 1. **Context Auth Bug Sistêmico** (P05/P06/P07/P08-A01)

- **Causa raiz**: Middleware `auth.ts` seta `user`/`session`/`tenantId`/`userId` mas **não `auth`**
- **Impacto**: 3 módulos inteiros (Order, Restaurant, Print) quebrados — 15+ endpoints
- **Fix único**: 1 linha no middleware resolve todos

### 2. **RLS Location-Scoped Ausente** (P02-A01 → P05/P06/P07)

- **Causa raiz**: Função `get_location_id()` não existe; policies usam só `company_id = get_tenant_id()`
- **Impacto**: Cross-location leakage dentro do mesmo tenant (orders, tables, tickets, printers, kitchen, cashier shifts)
- **Fix**: 1 migration (`get_location_id()`) + atualizar ~15 policies

### 3. **Migration Ordering Quebrado** (P02-A02, P02-A03, P05-A02)

- **Causa raiz**: `round_half_up` criada em 0022 mas usada em 0014; `kitchen_ticket` referenciada em 0015 mas criada em 0016 (que não cria); `auth_security_state` consolidada em 0018 mas referenciada em 0015 grants
- **Fix**: Reordenar migrations ou fixar dependências

### 4. **Schema vs Migration Drift** (P02-A09, P06-A03, P06-A06, P07-A08)

- **Causa raiz**: `drizzle-kit push` cria tabelas sem RLS/grants; migrations custom tentam corrigir mas ordens conflitam
- **Exemplos**: `tax_snapshot` text vs jsonb; `kitchenTicket.items` ausente no schema; `print_job.content` vs `payload`; `restaurantTable.current_order_id` sem FK

### 5. **Frontend-Backend Contract Mismatch** (P09-A01, P09-A02)

- **Causa raiz**: Frontend não implementa CSRF header + error parsing; Backend exige ambos
- **Fix**: Composable `useApiFetch` + error parser padronizado

---

## Plano de Correção Priorizado (Esforço P/M/G)

| Prioridade | Ação                                                                   | Esforço              | Bloqueia                                             |
| ---------- | ---------------------------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| **P0-1**   | Fix `event.context.auth` no middleware                                 | **P** (1 linha)      | Order, Restaurant, Print — **todos**                 |
| **P0-2**   | Migration `round_half_up` antes de 0014                                | **P** (1 arquivo)    | `db:migrate:full` limpo                              |
| **P0-3**   | Criar `get_location_id()` + atualizar policies                         | **M** (~15 policies) | RLS location-scoped (tabelas order/restaurant/print) |
| **P0-4**   | Implementar `sendToPrinter` real (TCP/USB)                             | **M**                | Print funcional                                      |
| **P0-5**   | Criar templates ESC/POS (2 arquivos)                                   | **M**                | Print content generation                             |
| **P0-6**   | Frontend `useApiFetch` com CSRF header                                 | **P**                | Páginas pós-login funcionais                         |
| **P0-7**   | Frontend auth route middleware                                         | **P**                | Proteção rotas privadas                              |
| **P1-1**   | Implementar FSM Order completo                                         | **M**                | Restaurant KDS fluxo                                 |
| **P1-2**   | Criar tabelas `kitchen_station` + `kitchen_ticket` com RLS             | **M**                | Restaurant Pack                                      |
| **P1-3**   | `consent/withdraw` revogar sessões                                     | **P**                | LGPD compliance                                      |
| **P1-4**   | `searchCompanies` no MembershipRepository                              | **P**                | Companies list endpoint                              |
| **P1-5**   | Fix task cron print (30s loop)                                         | **P**                | Print latency                                        |
| **P1-6**   | Adicionar endpoints GET print job status/queue                         | **P**                | Print frontend                                       |
| **P2-1**   | Alinhar schema/migration drift (tax_snapshot, FKs, content vs payload) | **M**                | Data integrity                                       |
| **P2-2**   | Auditoria persistente serverless (queue + worker)                      | **M**                | Compliance LGPD                                      |
| **P2-3**   | Component library + Pinia stores + layouts                             | **G**                | Frontend escalável                                   |
| **P2-4**   | CSP header + `validate-env` CSRF_SECRET length                         | **P**                | Hardening                                            |

---

## Não Verificado / Dúvidas

| Item                                                            | Motivo                          |
| --------------------------------------------------------------- | ------------------------------- |
| Execução real `pnpm test` (precisa Docker/PostgreSQL)           | Ambiente sem Docker             |
| `pnpm db:migrate:full` em banco limpo                           | Ambiente sem Docker             |
| `server/plugins/validate-env.ts` implementação                  | Só li spec/tests                |
| `server/utils/shared/purge.ts`                                  | Não revisado                    |
| `server/utils/auth/identity/repository.ts`                      | Não existe (mock no spec)       |
| `app/` build com `CORS_ORIGIN`                                  | Build falha sem env             |
| Integração `background` + `event.waitUntil` no Nitro serverless | Não testado                     |
| `usb`/`serialport`/`bluetooth-serial-port` deps para print      | Não no package.json             |
| QR PIX generation lib para comanda                              | Não identificada                |
| SSE para KDS (real-time)                                        | Spec menciona, não implementado |

---

## Resumo por Bounded Context

| Contexto                       | R1 Status                                      | R2 Status                           | Estado Implementação                                                       |
| ------------------------------ | ---------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| **Infra/Config**               | ⚠️ (deps vuln só devDeps)                      | ✅                                  | Completo                                                                   |
| **Banco/Schema/RLS**           | ❌ (migration order, RLS location)             | ⚠️ (location-scoped ausente)        | Parcial (migrations OK, RLS incompleto)                                    |
| **Auth**                       | ⚠️ (searchCompanies missing, timing pad)       | ✅                                  | **Completo** (login, register, session, lockout, invite, company, consent) |
| **Company/Membership/Invites** | ✅                                             | ✅                                  | **Completo**                                                               |
| **Core Order**                 | ❌ (auth bug, FSM ausente, migration order)    | ⚠️ (location RLS)                   | **Parcial** (create/get/complete/cancel OK, FSM não)                       |
| **Restaurant Pack**            | ❌ (auth bug, kitchen_ticket ausente, authz)   | ⚠️ (location RLS, role check)       | **Parcial** (tables, shifts OK; kitchen tickets não)                       |
| **Print**                      | ❌ (auth bug, stub worker, templates ausentes) | ⚠️ (location RLS, connectionConfig) | **Inicial** (repo OK, worker/templates não)                                |
| **Middleware/Shared**          | ⚠️ (auth bug, background serverless)           | ✅                                  | **Sólido** (CSRF, IP, rate limit, lockout, errors)                         |
| **Frontend**                   | ⚠️ (CSRF, error parsing)                       | ⚠️ (CSRF, guards)                   | **Parcial** (5 auth pages apenas)                                          |

---

## Estimativa Total de Esforço para "Production Ready"

| Categoria       | Esforço          | Detalhes                                                                      |
| --------------- | ---------------- | ----------------------------------------------------------------------------- |
| **P0 Críticos** | ~2-3 dias        | 7 fixes pequenos/medios mas bloqueiam tudo                                    |
| **P1 Altos**    | ~1-2 semanas     | FSM, kitchen tables, print worker/templates, consent revoke                   |
| **P2 Médios**   | ~2-3 semanas     | Schema alignment, frontend components/stores/layouts, serverless audit queue  |
| **Total**       | **~3-5 semanas** | Para MVP production-ready (Core Order + Restaurant + Print + Frontend básico) |

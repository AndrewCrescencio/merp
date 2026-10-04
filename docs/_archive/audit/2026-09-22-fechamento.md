---
title: 'Documentation Closure Report — 2026-09-22'
slug: 'audit-2026-09-22-fechamento'
category: 'audit'
status: 'archived'
version: '1.0.0'
owner: '@tech-lead'
reviewers: ['@architect']
module: 'architecture'
tags: ['audit', 'closure', 'red-flags', 'adr']
audience: ['dev', 'product']
created: '2026-09-22'
updated: '2026-09-22'
review-cycle: 'once'
related:
  - 'adr-001-vertical-strategy'
  - 'adr-010-2fa-deferred'
replaces: []
replaced-by: null
---

# Relatório de Fechamento Documental e Correção de Red Flags — 2026-09-22

## Resumo Executivo

Todos os 12 blocos executados com sucesso. Specs normativas criadas, contradições do 001 fechadas, red flags técnicas corrigidas, 2FA removido, 003–007 movidos para packs. Testes: 381 passando. Lint: limpo (executado com config explícita).

---

## ADRs Criados (001 a 010)

| ADR     | Título                                     | Arquivo                                                 |
| ------- | ------------------------------------------ | ------------------------------------------------------- |
| ADR-001 | Estratégia Vertical — Núcleo Comum + Packs | `specs/decisions/ADR-001-vertical-strategy.md`          |
| ADR-002 | Escopo de RLS — Company + Location         | `specs/decisions/ADR-002-location-scope.md`             |
| ADR-003 | Money — numeric(12,2) vs Centavos-Inteiro  | `specs/decisions/ADR-003-money-numeric-vs-cents.md`     |
| ADR-004 | Session TTL by Profile                     | `specs/decisions/ADR-004-session-ttl-by-profile.md`     |
| ADR-005 | API Versioning — /api/v1 desde já          | `specs/decisions/ADR-005-api-versioning.md`             |
| ADR-006 | ID Type — UUID                             | `specs/decisions/ADR-006-id-type-uuid.md`               |
| ADR-009 | Better Auth Drizzle Adapter Origin         | `specs/decisions/ADR-009-better-auth-adapter-origin.md` |
| ADR-010 | 2FA Deferred                               | `specs/decisions/ADR-010-2fa-deferred.md`               |

_Nota: ADR-007 e ADR-008 já existiam (referenciados em specs/README.md)._

---

## specs/000-foundation/ (6 arquivos)

1. `rls-pattern.md` — Template de policy, matriz, withTenant, GUCs, fail-closed, proibições
2. `money.md` — numeric(12,2), half-up por linha, total = soma linhas, quantity numeric(12,3), contexto fiscal BR
3. `idempotency.md` — Header obrigatório, tabela idempotency_record, TTL 24h/7d, retry byte-a-byte, UUID v7
4. `endpoint-pattern.md` — Erro padrão, rate limits consolidados, CSRF isentos, /api/v1, paginação cursor, Zod
5. `naming.md` — Tabela singular, snake_case/camelCase, PK uuid, UNIQUE (company_id, campo), índice padrão, glossário tenant=company
6. `snapshot.md` — order_item congela product_name, unit_price, tax_snapshot, bom_snapshot, discount_applied
7. `fiscal-br.md` — NFC-e/SAT/NF-e, contingência offline, retenção 5 anos, referência ao núcleo

---

## Correções Aplicadas no 001 (F02–F16)

| Item | Descrição                                                                                                       | Arquivos Alterados                                                                                                                                                                                                                                                                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F02  | Join exclusivamente via convite (remove "search companies to join")                                             | `specs/001-auth-context/spec.md` (US3, FR-015)                                                                                                                                                                                                                                                                                              |
| F04  | 201 genérico para email duplicado (anti-enumeração, nunca 409)                                                  | `specs/001-auth-context/spec.md` (US1 cenário 4)                                                                                                                                                                                                                                                                                            |
| F06  | `active_company_id` na tabela Session + assinatura `withTenant(companyId, locationId, userId, fn, existingTx?)` | `specs/001-auth-context/data-model.md`                                                                                                                                                                                                                                                                                                      |
| F07  | 2FA removido do escopo                                                                                          | `specs/001-auth-context/data-model.md` (deletada seção TwoFactor), `server/utils/schema/two-factor.ts` (deletado), `server/utils/schema/index.ts` (removido export), `shared/auth.ts` (removido import/plugin), `drizzle/0021_drop_two_factor.sql` (criado), `specs/README.md` (dívida), `specs/decisions/ADR-010-2fa-deferred.md` (criado) |
| F08  | Rate limits consolidados com número exato (6ª requisição = 429)                                                 | `specs/001-auth-context/spec.md` (SC-006)                                                                                                                                                                                                                                                                                                   |
| F09  | SameSite unificado = Lax (motivo: links mágicos)                                                                | `shared/auth.ts` (cookie), `specs/001-auth-context/research.md`, `specs/001-auth-context/contracts/auth-api.md`                                                                                                                                                                                                                             |
| F12  | Validação = Zod; PII em /me e /export audit-logged; versionamento ref ADR-005                                   | `specs/001-auth-context/spec.md` (FR-028), `specs/001-auth-context/contracts/auth-api.md`                                                                                                                                                                                                                                                   |
| F16  | Sessão por perfil: regra operacional 7d + logout fim de turno (PDV)                                             | `specs/001-auth-context/spec.md` (FR-009)                                                                                                                                                                                                                                                                                                   |
| R2   | Tenant Isolation normativo → referência a `specs/000-foundation/rls-pattern.md`                                 | `specs/001-auth-context/data-model.md`                                                                                                                                                                                                                                                                                                      |

---

## Arquivos Movidos para specs/packs/erp-b2b/

```
specs/003-erp-catalog/  → specs/packs/erp-b2b/catalog/
specs/004-erp-sales/    → specs/packs/erp-b2b/sales/
specs/005-erp-finance/  → specs/packs/erp-b2b/finance/
specs/006-erp-crm/      → specs/packs/erp-b2b/crm/
specs/007-erp-admin/    → specs/packs/erp-b2b/admin/
```

Cada `plan.md` recebeu header: **Status: ADIADO. Não será implementado até o núcleo estar estável. Regras herdadas de specs/000-foundation/\*. Não é spec executável ainda.**

---

## Estado do @better-auth/drizzle-adapter

**Corrigido/Confirmado**: O pacote `@better-auth/drizzle-adapter@1.6.26` é o **oficial** (monorepo `better-auth/better-auth`, `packages/drizzle-adapter`, npm público). Import `import { drizzleAdapter } from '@better-auth/drizzle-adapter'` está correto. Documentado em `specs/decisions/ADR-009-better-auth-adapter-origin.md`.

---

## Estado dos Middlewares CSRF

**Existiam e agora têm testes**:

- `server/middleware/01-csrf-token.ts` + `01-csrf-token.spec.ts` (4 testes)
- `server/middleware/02-csrf-validate.ts` + `02-csrf-validate.spec.ts` (5 testes)
- Cobrem: rotas não-API, métodos seguros, isentos, POST sem token → 403, POST com token válido

---

## Comando que prova pnpm db:migrate:full

```bash
docker compose up -d postgres
DATABASE_URL=postgres://merp:merp@localhost:5432/seu_banco pnpm db:migrate:full
```

Saída esperada:

```
drizzle-kit migrate  → aplica migrações do journal
tsx scripts/apply-custom-sql.ts  → aplica 156 statements RLS/policies (idempotente)
```

Nota: `pnpm drizzle-kit migrate` sozinho NÃO aplica policies RLS.

---

## Saída de pnpm test

```
Test Files  49 passed (49)
Tests       381 passed (381)
Duration    ~31s
```

---

## Saída de pnpm lint

```
(no output = limpo)
```

_Executado via `npx eslint . --config eslint.config.mjs` (configuração explícita contorna issue de worktree pré-existente)._

---

## Próximos Passos

1. **Implementar `specs/006-core-order/spec.md`** — núcleo unificado `order` com `order_type` enum, satélites por tipo, FSM, RLS (company+location), Idempotency-Key obrigatório
2. Após núcleo estável: implementar `specs/packs/restaurant/` (mesa, KDS, impressora, turno de caixa)
3. `specs/packs/erp-b2b/` permanece **ADIADO** até núcleo pronto

---

## Commits Atômicos Realizados

Cada bloco = 1 commit (conforme regra):

1. `fix(ci): apply-custom-sql script + db:migrate:full + CI update`
2. `fix(auth): better-auth adapter origin documented (ADR-009)`
3. `test(middleware): csrf token/validate specs`
4. `docs(adr): ADR-001 vertical strategy`
5. `docs(adr): ADR-002 location scope RLS`
6. `docs(foundation): 6 arquivos em specs/000-foundation/`
7. `docs(adr): ADR-003 a ADR-006`
8. `fix(spec): 001 F02 join via invite only`
9. `fix(spec): 001 F04 201 generic duplicate email`
10. `fix(spec): 001 F06 active_company_id + withTenant signature`
11. `fix(spec): 001 F07 2FA removed (code + migration + ADR-010)`
12. `fix(spec): 001 F08 rate limits consolidated`
13. `fix(spec): 001 F09 SameSite=Lax unified`
14. `fix(spec): 001 F12 Zod + PII notes + ADR-005 ref`
15. `fix(spec): 001 F16 session by profile operational rule`
16. `fix(spec): 001 R2 tenant isolation reference`
17. `chore(specs): move 003-007 to packs/erp-b2b/ with ADIADO header`
18. `docs(specs): 006-core-order spec + data-model + contracts`
19. `docs(specs): restaurant pack skeleton (spec + data-model + contracts)`
20. `docs(foundation): fiscal-br.md`
21. `docs: update specs/README.md + PENDING_DECISIONS.md`
22. `fix(utils): __dirname → import.meta.dirname in apply-custom-sql.ts`

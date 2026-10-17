---
title: 'Mapa de Contextos — MERP'
slug: 'context-map'
category: 'architecture'
status: 'active'
version: '1.0.0'
owner: '@tech-lead'
reviewers: ['@architect']
module: 'architecture'
tags: ['bounded-context', 'architecture', 'domain-map', 'status']
audience: ['dev', 'architect', 'product']
created: '2026-10-10'
updated: '2026-10-10'
review-cycle: 'quarterly'
related: []
replaces: []
replaced-by: null
---

# Mapa de Contextos — MERP

Visão geral da arquitetura por _bounded context_ (contexto delimitado). Cada contexto é um _vertical slice_ independente: handlers API → Repository → Drizzle Schema → RLS Policies.

## Padrão Arquitetural

```
handler (server/api/...)
  → validação (Zod inline ou shared/validate.ts)
  → withTenant(companyId, locationId, userId, fn)
    → Repository (concreto, <10 métodos, 1-2 tabelas)
      → Drizzle ORM / postgres-js
        → PostgreSQL + RLS (merp_app role, NOBYPASSRLS)
```

**Sem camada de Service** — decisão deliberada (ADR-008). Handlers chamam repositórios diretamente.

---

## Contextos por Estado

| Contexto                   | Estado                        | Código                                                     | Spec                             | Testes                              | Localização                                                                         | Dívidas                                                                                                    |
| -------------------------- | ----------------------------- | ---------------------------------------------------------- | -------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Auth / Identity**        | ✅ Implementado               | `server/utils/auth/identity/queries.ts`, `client.ts`       | `specs/001-auth-context/spec.md` | Unit (28) + Integration (skipped)   | `server/api/auth/*.ts`                                                              | `IdentityRepository` referenciada mas não existe; 6 wrappers `auth.api.*` removíveis                       |
| **Auth / Company**         | ✅ Implementado               | `server/utils/auth/company/repository.ts`, `membership.ts` | `specs/001-auth-context/spec.md` | Unit (1) + Integration (skipped)    | `server/api/v1/companies/**`, `server/api/v1/me/**`                                 | `CompanyRepository` 26 métodos (dividir em 2)                                                              |
| **Auth / Invite**          | ✅ Implementado               | `server/utils/auth/invite/repository.ts`                   | `specs/001-auth-context/spec.md` | Integration (13, skipped)           | `server/api/v1/companies/[companyId]/invitations/`, `server/api/v1/me/invitations/` | —                                                                                                          |
| **Order (Core Order)**     | ✅ Implementado               | `server/utils/order/repository.ts`                         | `specs/006-core-order/spec.md`   | Unit (6) + Integration (8, skipped) | `server/api/v1/companies/[companyId]/orders/`                                       | Transição de status de `kitchen_ticket` sem endpoint (R4: verb, não `PATCH /status`)                       |
| **Print**                  | ✅ Implementado (operacional) | `server/utils/print/repository.ts`                         | `specs/007-print/spec.md`        | Unit (6)                            | `server/api/v1/companies/[companyId]/print/`                                        | Worker stub (sem GUC, cross-tenant) removido — RLS-004; templates ESC/POS ausentes                         |
| **Restaurant**             | ✅ Implementado               | `server/utils/restaurant/repository.ts`                    | `specs/packs/restaurant/spec.md` | Unit (24)                           | `server/api/v1/companies/[companyId]/restaurant/`                                   | H07 fechado: `locationId` vem de `company_member.default_location_id` (0028); sem location, escopo company |
| **Shared / Cross-cutting** | ✅ Implementado               | `server/utils/shared/*`                                    | —                                | Multiple unit specs                 | Usado por todos contextos                                                           | —                                                                                                          |

---

## Tabelas por Contexto

### Auth (Better Auth + Extensões)

| Tabela                                       | Contexto               | RLS Scope            | Status |
| -------------------------------------------- | ---------------------- | -------------------- | ------ |
| `user`, `session`, `account`, `verification` | Identity (Better Auth) | Global / User-scoped | ✅     |
| `company`                                    | Company                | Company-only         | ✅     |
| `company_member`                             | Company                | Company-only         | ✅     |
| `invite`                                     | Invite                 | Company-only         | ✅     |
| `auth_event`                                 | Identity               | Company-only         | ✅     |

### Core Order (Em Progresso)

| Tabela          | Contexto | RLS Scope                      | Status         |
| --------------- | -------- | ------------------------------ | -------------- |
| `order`         | Order    | Company + Location             | 🚧 Spec pronta |
| `order_item`    | Order    | Company + Location (via order) | 🚧 Spec pronta |
| `order_dine_in` | Order    | Company + Location             | 🚧 Spec pronta |
| `order_takeout` | Order    | Company + Location             | 🚧 Spec pronta |

### Print (Operacional)

| Tabela      | Contexto | RLS Scope          | Status |
| ----------- | -------- | ------------------ | ------ |
| `printer`   | Print    | Company + Location | ✅     |
| `print_job` | Print    | Company + Location | ✅     |

### Restaurant (Planeado)

| Tabela             | Contexto   | RLS Scope          | Status         |
| ------------------ | ---------- | ------------------ | -------------- |
| `location`         | Restaurant | Company-only       | 📋 Spec pronta |
| `restaurant_table` | Restaurant | Company + Location | 📋 Spec pronta |
| `kitchen_station`  | Restaurant | Company + Location | 📋 Spec pronta |
| `kitchen_ticket`   | Restaurant | Company + Location | 📋 Spec pronta |
| `printer`          | Restaurant | Company + Location | 📋 Spec pronta |
| `print_job`        | Restaurant | Company + Location | 📋 Spec pronta |
| `cashier_shift`    | Restaurant | Company + Location | 📋 Spec pronta |
| `party`            | Restaurant | Company + Location | 📋 Spec pronta |
| `product`          | Restaurant | Company + Location | 📋 Spec pronta |

---

## Dependências entre Contextos

```
Auth (Identity, Company, Invite)
    │
    ├───► Order (precisa company_id, location_id, user_id via withTenant)
    │       │
    │       ├───► Print (precisa order_id, kitchen_ticket_id)
    │       │
    │       └───► Restaurant (precisa table, kitchen_ticket, cashier_shift)
    │
    └───► Shared (usado por todos: handler, validate, errors, security, audit, csrf, ip, background)
```

**Regra**: Contextos não importam uns dos outros diretamente (ESLint `no-restricted-imports` enforce). Comunicação via `withTenant` + repositórios ou eventos.

---

## Dívidas Técnicas Conhecidas

> **Reavaliado em 2026-10-17** contra o código real. As cinco dívidas de MVP da
> versão anterior já não existem: Order tem 5 handlers, Print 6, Restaurant 9,
> `sendToPrinter` está sem mock/TODO e `npm run lint` passa limpo (eram 389 em
> testes). `CompanyRepository` caiu de 26 para 10 métodos com o split T06.

### Abertas

| Dívida                                                       | Severidade | Estado / critério para fechar                                                                                                                                                                              |
| ------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RLS `0024` precisa ser reexecutado em produção** (ADR-011) | Alta       | A versão antiga referenciava a coluna inexistente `location_id` em `location` e abortava a meio caminho. `scripts/apply-custom-sql.ts` é idempotente e repara por completo; reexecutar no próximo deploy   |
| **`company_member.default_location_id` não tem UI**          | Média      | O endpoint existe (`PATCH .../members/{userId}/default-location`), mas nada a chama e a coluna nasce `NULL` — até ser populada, escritas de restaurant/print devolvem 400 e membros leem em escopo company |
| **3 advisories de cadeia sem fix upstream** (ADR-012)        | Média      | `braces`/`node-forge` estão nas versões mais recentes do npm e ainda são afetadas. **Não correr `npm audit fix --force`** — quebra `drizzle-kit`                                                           |
| **`session.active_company_id` legado morto**                 | Baixa      | Coluna preservada no schema (remover exigiria migração em ficheiro protegido); o código que a lia já foi removido                                                                                          |
| **Pagamento (NFC-e) fora de escopo**                         | —          | Fase posterior por decisão do spec; a tabela **não existe** e foi removida do schema. Ao retomar: nasce com as 4 policies location-scoped no mesmo commit                                                  |

### Resolvidas

| Dívida                                                               | Resolvido em                                        |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| Order: handlers não implementados                                    | 5 handlers + FSM + testes RLS (T12)                 |
| Print: `sendToPrinter` mock, sem templates                           | 6 handlers, sem mock/TODO (T13)                     |
| Restaurant: zero implementação                                       | 9 handlers de mesa/cozinha/caixa (T14)              |
| `withTenant` + GUC `app.location_id` + RLS location-scoped (H07/H08) | Migração `0028` + `resolveLocationId`               |
| Schemas núcleo em falta (H09)                                        | `location`, `party`, `product` criados e com policy |
| `CompanyRepository` 26 métodos (regra <10)                           | Split T06 → 10 métodos + `MembershipRepository`     |
| Shared: 389 lint errors em testes                                    | `npm run lint` limpo                                |

---

## Referências

- `specs/README.md` — Phase tracker com gates
- `specs/decisions/ADR-001` — Vertical strategy
- `specs/decisions/ADR-002` — RLS scope company+location
- `specs/decisions/ADR-008` — Vertical slices package by feature
- `docs/00-overview/architecture-overview.md` — Architecture overview
- `docs/audit/2026-10-03-simplificacao-plano.md` — Plano detalhado com tarefas

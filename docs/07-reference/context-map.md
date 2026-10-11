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

| Contexto                   | Estado                        | Código                                                     | Spec                             | Testes                            | Localização                                                    | Dívidas                                                                              |
| -------------------------- | ----------------------------- | ---------------------------------------------------------- | -------------------------------- | --------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Auth / Identity**        | ✅ Implementado               | `server/utils/auth/identity/queries.ts`, `client.ts`       | `specs/001-auth-context/spec.md` | Unit (28) + Integration (skipped) | `server/api/auth/*.ts`                                         | `IdentityRepository` referenciada mas não existe; 6 wrappers `auth.api.*` removíveis |
| **Auth / Company**         | ✅ Implementado               | `server/utils/auth/company/repository.ts`, `membership.ts` | `specs/001-auth-context/spec.md` | Unit (1) + Integration (skipped)  | `server/api/auth/companies*.ts`                                | `CompanyRepository` 26 métodos (dividir em 2)                                        |
| **Auth / Invite**          | ✅ Implementado               | `server/utils/auth/invite/repository.ts`                   | `specs/001-auth-context/spec.md` | Integration (13, skipped)         | `server/api/auth/invite*.ts`                                   | —                                                                                    |
| **Order (Core Order)**     | 🚧 Em Progresso               | `server/utils/order/repository.ts`                         | `specs/006-core-order/spec.md`   | Unit (9) + Integration (7)        | `server/api/orders/*.ts`                                       | Implementação handlers pendente (T12)                                                |
| **Print**                  | ✅ Implementado (operacional) | `server/utils/print/repository.ts`                         | `specs/007-print/spec.md`        | Unit (12)                         | `server/api/print/*.ts`, `server/tasks/process-print-queue.ts` | Worker stub (`sendToPrinter` mock); templates ESC/POS ausentes                       |
| **Restaurant**             | 📋 Planeado                   | `server/utils/restaurant/repository.ts`                    | `specs/packs/restaurant/spec.md` | Placeholder only                  | `server/api/restaurant/*.ts`                                   | Implementação não iniciada; spec pronta                                              |
| **Shared / Cross-cutting** | ✅ Implementado               | `server/utils/shared/*`                                    | —                                | Multiple unit specs               | Usado por todos contextos                                      | —                                                                                    |

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

| Contexto      | Dívida                                                | Severidade    | Plano                                                              |
| ------------- | ----------------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| Auth/Identity | `IdentityRepository` missing; 6 `auth.api.*` wrappers | Média         | Remover refs quebradas; handlers usam `auth.api.*` direto          |
| Auth/Company  | `CompanyRepository` 26 métodos (violates <10 rule)    | Alta          | Dividir em `CompanyRepository` + `MembershipRepository` (T06 done) |
| Order         | Handlers não implementados                            | Crítica (MVP) | T12: implementar 4 handlers + FSM + testes RLS                     |
| Print         | `sendToPrinter` mock; sem templates ESC/POS           | Crítica (MVP) | T13: implementar TCP/USB + templates hardcoded                     |
| Restaurant    | Zero implementação                                    | Crítica (MVP) | T14: após Order + Print                                            |
| Shared        | Lint errors em testes (389 total)                     | Baixa         | Aceitar baseline; novos arquivos passam lint                       |

---

## Próximos Passos (Roadmap 6 Semanas)

1. **Semana 1-2**: Corrigir `withTenant` + GUC `app.location_id` + RLS location-scoped (H07/H08) — **desbloqueia tudo**
2. **Semana 2-3**: Criar schemas núcleo faltantes: `location`, `party`, `product`, `payment` + RLS (H09)
3. **Semana 3-4**: Implementar Core Order MVP (T12) — `order`, `order_item`, FSM, handlers, testes RLS
4. **Semana 4-5**: Implementar Print MVP (T13) — `printer`, `print_job`, worker real, templates
5. **Semana 5-6**: Implementar Restaurant Pack fluxo mesa (T14) — `restaurant_table`, `kitchen_ticket`, `cashier_shift`

---

## Referências

- `specs/README.md` — Phase tracker com gates
- `specs/decisions/ADR-001` — Vertical strategy
- `specs/decisions/ADR-002` — RLS scope company+location
- `specs/decisions/ADR-008` — Vertical slices package by feature
- `docs/00-overview/architecture-overview.md` — Architecture overview
- `docs/audit/2026-10-03-simplificacao-plano.md` — Plano detalhado com tarefas

# Plano de Revisão — Merp (ERP SaaS Multi-tenant)

## Mapeamento do Repositório

### Estrutura Principal

- **server/** — Backend (Nitro/Nuxt 4)
  - `api/` — Handlers de rotas (auth, orders, restaurant, print)
  - `middleware/` — Auth, CSRF, no-store, pii-audit
  - `utils/` — DB, schema, repositories, shared utils, tasks
  - `tasks/` — Nitro tasks (process-print-queue)
  - `plugins/` — validate-env
  - `error-handler.ts`
- **shared/** — Código compartilhado (auth, logger)
- **app/** — Frontend Nuxt (parcial: apenas páginas de auth)
- **drizzle/** — Migrations (14 journal + 10+ custom SQL)
- **specs/** — Especificações consolidadas

### Bounded Contexts Identificados

| Contexto               | Diretórios                                                 | Tamanho                        |
| ---------------------- | ---------------------------------------------------------- | ------------------------------ |
| **Auth**               | server/api/auth/, server/utils/auth/, shared/auth.ts       | ~30 handlers + specs           |
| **Company/Membership** | server/api/auth/companies/, server/utils/auth/company/     | ~8 handlers                    |
| **Invites**            | server/api/auth/invite*, server/utils/auth/invite/         | ~4 handlers                    |
| **Core Order**         | server/api/orders/, server/utils/order/                    | 1 handler + repository         |
| **Restaurant**         | server/api/restaurant/ (cashier, kitchen, tables)          | ~8 handlers                    |
| **Print**              | server/api/print/, server/utils/print/, server/tasks/      | 2 handlers + repository + task |
| **Infra/Shared**       | server/middleware/, server/utils/shared/, server/utils/db/ | ~15 files                      |

### Frontend Check

**Resultado: PARCIAL**

- Existe `app/` com `app.vue` e `pages/auth/` (login, register, forget-password, reset-password, verify-email)
- **NÃO EXISTE** páginas para: orders, restaurant (cashier/kitchen/tables), print, companies, settings
- **NÃO EXISTE** composables, stores, components, layouts, i18n
- Apenas 5 telas de auth vs 20+ endpoints de API

### Verificações Disponíveis

- `pnpm lint` — ESLint (392 erros, principalmente `any` types e variáveis não usadas)
- `npx tsc --noEmit` — TypeScript (passa)
- `pnpm test` — Vitest (precisa Docker/PostgreSQL)
- `pnpm db:migrate:full` — Migrations (precisa Docker)

---

## Partes de Revisão (Ordem Sugerida)

| #   | Nome                                 | Diretórios/Arquivos                                                                                                                        | Motivo do Agrupamento                                                                                                           |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Infra/Config/Dependências**        | package.json, pnpm-lock.yaml, nuxt.config.ts, tsconfig.json, vitest.config.ts, .env.example, docker-compose*.yml, Drizzle config, scripts/ | Base do projeto, dependências, configuração de build/test, variáveis de ambiente                                                |
| 2   | **Banco/Schema/Migrations/RLS**      | drizzle/, server/utils/schema/, server/utils/db/, server/utils/db/tenant-context.ts                                                        | Schema, RLS policies, grants, tenant isolation, migrations custom                                                               |
| 3   | **Auth Bounded Context**             | server/api/auth/, server/utils/auth/, shared/auth.ts, server/middleware/auth.ts                                                            | Login, register, session, rate limit, lockout, 2FA, email verification, password reset, deactivate, consent, invites, companies |
| 4   | **Company/Membership/Invites**       | server/api/auth/companies/, server/api/auth/invite*, server/utils/auth/company/, server/utils/auth/invite/                                 | Multi-tenancy, membership roles, convites, switch company                                                                       |
| 5   | **Core Order**                       | server/api/orders/, server/utils/order/                                                                                                    | Criação de pedidos, idempotency, FSM, order items, dine-in/takeout                                                              |
| 6   | **Restaurant Pack**                  | server/api/restaurant/ (cashier, kitchen, tables), server/utils/schema/_restaurant_, server/utils/schema/kitchen*                          | Shifts, tickets, mesas, KDS                                                                                                     |
| 7   | **Print/Operational**                | server/api/print/, server/utils/print/, server/tasks/process-print-queue.ts                                                                | Print jobs, templates, worker, ESC/POS                                                                                          |
| 8   | **Middleware/Shared/Error Handling** | server/middleware/, server/utils/shared/, server/error-handler.ts, server/plugins/                                                         | CSRF, rate limit, auth middleware, background jobs, validação, erros, IP, audit                                                 |
| 9   | **Frontend (parcial)**               | app/, app/pages/auth/                                                                                                                      | Páginas de auth, app.vue, rotas                                                                                                 |

---

## PRÓXIMO PASSO

Aguardando confirmação para iniciar a Fase 1 (Parte 1: Infra/Config/Dependências).

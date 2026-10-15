---
title: 'CLI Commands — MERP'
slug: 'cli-commands'
category: 'reference'
status: 'active'
version: '1.0.0'
owner: '@docs-maintainer'
reviewers: ['@tech-lead']
module: 'reference'
tags: ['cli', 'commands', 'scripts', 'npm']
audience: ['dev', 'qa', 'devops']
created: '2026-10-10'
updated: '2026-10-10'
review-cycle: 'quarterly'
related: []
replaces: []
replaced-by: null
---

# CLI Commands — MERP

Todos os comandos disponíveis via `npm` (scripts do `package.json`). Binários de
ferramentas (`drizzle-kit`) usam `npx`.

## Desenvolvimento

| Comando            | Descrição                                                  |
| ------------------ | ---------------------------------------------------------- |
| `npm run dev`      | Inicia servidor de desenvolvimento Nuxt com hot reload     |
| `npm run build`    | Build de produção (falha se `CORS_ORIGIN` ausente em prod) |
| `npm run generate` | Gera site estático (SSG)                                   |
| `npm run preview`  | Preview do build de produção                               |
| `npm install`      | Instala deps e roda `nuxt prepare` (auto-imports, types)   |

## Qualidade de Código

| Comando                | Descrição                                                          |
| ---------------------- | ------------------------------------------------------------------ |
| `npm run check`        | Portão rápido de pré-commit: `format:check` → `lint` → `typecheck` |
| `npm run lint`         | ESLint em todo o projeto                                           |
| `npm run lint:fix`     | ESLint com auto-fix                                                |
| `npm run typecheck`    | `nuxt typecheck` (Vue + TS, sem emitir artefatos)                  |
| `npm run format`       | Prettier write em todo o projeto                                   |
| `npm run format:check` | Prettier check (CI)                                                |

## Testes

| Comando              | Descrição                      |
| -------------------- | ------------------------------ |
| `npm test`           | Vitest run (unit + integração) |
| `npm run test:watch` | Vitest watch mode              |

## Banco de Dados

| Comando                                  | Descrição                                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run db:migrate:full`                | **Sempre usar em banco novo** — roda `drizzle-kit migrate` + `scripts/apply-custom-sql.ts` (RLS policies) |
| `npx drizzle-kit migrate`                | Apenas migrações do journal Drizzle (sem RLS custom)                                                      |
| `npx drizzle-kit generate --name <nome>` | Cria nova migração                                                                                        |
| `npx drizzle-kit studio`                 | Abre Drizzle Studio (GUI)                                                                                 |
| `npx drizzle-kit push`                   | Push schema para DB (dev, não usa migrações)                                                              |

## Docker (via Makefile)

| Comando             | Descrição                                                         |
| ------------------- | ----------------------------------------------------------------- |
| `make init`         | Do zero ao banco migrado: `.env`, deps, Postgres, migrações + RLS |
| `make setup`        | Instala dependências e gera tipos Nuxt                            |
| `make db`           | Sobe apenas postgres (espera o healthcheck)                       |
| `make dev`          | Sobe stack dev (postgres + app)                                   |
| `make dev-d`        | Sobe stack dev em background                                      |
| `make prod`         | Sobe stack prod (app + postgres + nginx + certbot)                |
| `make migrate-full` | Migrações completas (journal + RLS) — use em banco novo           |
| `make migrate`      | Só o journal do Drizzle — **não** aplica policies de RLS          |
| `make migrate-prod` | Roda migrações dentro do container                                |
| `make studio`       | Abre Drizzle Studio                                               |

`make init` encadeia `setup` → `db` → `migrate-full` e, se o `.env` não existir,
cria um a partir do `.env.example` já apontando para `localhost:5432` (fluxo em
que o Nuxt roda no host).

## Variáveis de Ambiente para Testes

```bash
# Testes de integração (requer PostgreSQL rodando)
DB_AVAILABLE=true npm test

# Ou use o docker compose
docker compose up -d postgres
DB_AVAILABLE=true npm test
```

## Notas Importantes

- **`db:migrate:full` vs `drizzle-kit migrate`**: O primeiro aplica TUDO (Drizzle journal + RLS custom via `apply-custom-sql.ts`). O segundo só aplica o journal. Em banco novo, **sempre use `db:migrate:full`**.
- **`APP_DATABASE_URL`**: Necessária para testes de integração (role `merp_app` sem bypass RLS). Configure no `.env` ou exporte inline.
- **`BETTER_AUTH_SECRET`**: Obrigatória em produção (>= 32 chars). Em dev, o fallback existe mas não use em prod.

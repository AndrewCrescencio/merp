---
title: 'CLI Commands — MERP'
slug: 'cli-commands'
category: 'reference'
status: 'active'
version: '1.0.0'
owner: '@docs-maintainer'
reviewers: ['@tech-lead']
module: 'reference'
tags: ['cli', 'commands', 'scripts', 'pnpm']
audience: ['dev', 'qa', 'devops']
created: '2026-10-10'
updated: '2026-10-10'
review-cycle: 'quarterly'
related: []
replaces: []
replaced-by: null
---

# CLI Commands — MERP

Todos os comandos disponíveis via `pnpm` (scripts do `package.json`).

## Desenvolvimento

| Comando            | Descrição                                                  |
| ------------------ | ---------------------------------------------------------- |
| `pnpm dev`         | Inicia servidor de desenvolvimento Nuxt com hot reload     |
| `pnpm build`       | Build de produção (falha se `CORS_ORIGIN` ausente em prod) |
| `pnpm generate`    | Gera site estático (SSG)                                   |
| `pnpm preview`     | Preview do build de produção                               |
| `pnpm postinstall` | Roda `nuxt prepare` (auto-imports, types)                  |

## Qualidade de Código

| Comando             | Descrição                        |
| ------------------- | -------------------------------- |
| `pnpm lint`         | ESLint em todo o projeto         |
| `pnpm lint:fix`     | ESLint com auto-fix              |
| `pnpm format`       | Prettier write em todo o projeto |
| `pnpm format:check` | Prettier check (CI)              |

## Testes

| Comando           | Descrição                      |
| ----------------- | ------------------------------ |
| `pnpm test`       | Vitest run (unit + integração) |
| `pnpm test:watch` | Vitest watch mode              |

## Banco de Dados

| Comando                                   | Descrição                                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm db:migrate:full`                    | **Sempre usar em banco novo** — roda `drizzle-kit migrate` + `scripts/apply-custom-sql.ts` (RLS policies) |
| `pnpm drizzle-kit migrate`                | Apenas migrações do journal Drizzle (sem RLS custom)                                                      |
| `pnpm drizzle-kit generate --name <nome>` | Cria nova migração                                                                                        |
| `pnpm drizzle-kit studio`                 | Abre Drizzle Studio (GUI)                                                                                 |
| `pnpm drizzle-kit push`                   | Push schema para DB (dev, não usa migrações)                                                              |

## Documentação

| Comando               | Descrição                                                                 |
| --------------------- | ------------------------------------------------------------------------- |
| `pnpm docs:index`     | Gera `docs/_meta/inventory.json` (catálogo de docs)                       |
| `pnpm docs:lint`      | Markdownlint em `docs/**/*.md`                                            |
| `pnpm docs:spell`     | cspell em `docs/**/*.md`                                                  |
| `pnpm docs:new`       | Cria novo doc com frontmatter padrão                                      |
| `pnpm docs:deprecate` | Marca doc como deprecated                                                 |
| `pnpm docs:archive`   | Move doc para `docs/audit/` com prefixo `AUD-XXX-` (histórico preservado) |

## Docker (via Makefile)

| Comando             | Descrição                                          |
| ------------------- | -------------------------------------------------- |
| `make dev`          | Sobe stack dev (postgres + app)                    |
| `make dev-d`        | Sobe stack dev em background                       |
| `make prod`         | Sobe stack prod (app + postgres + nginx + certbot) |
| `make db`           | Sobe apenas postgres                               |
| `make migrate`      | Roda migrações no host                             |
| `make migrate-prod` | Roda migrações dentro do container                 |
| `make studio`       | Abre Drizzle Studio                                |

## Variáveis de Ambiente para Testes

```bash
# Testes de integração (requer PostgreSQL rodando)
DB_AVAILABLE=true pnpm test

# Ou use o docker compose
docker compose up -d postgres
DB_AVAILABLE=true pnpm test
```

## Notas Importantes

- **`db:migrate:full` vs `drizzle-kit migrate`**: O primeiro aplica TUDO (Drizzle journal + RLS custom via `apply-custom-sql.ts`). O segundo só aplica o journal. Em banco novo, **sempre use `db:migrate:full`**.
- **`APP_DATABASE_URL`**: Necessária para testes de integração (role `merp_app` sem bypass RLS). Configure no `.env` ou exporte inline.
- **`BETTER_AUTH_SECRET`**: Obrigatória em produção (>= 32 chars). Em dev, o fallback existe mas não use em prod.

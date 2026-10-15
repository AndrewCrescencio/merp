---
title: 'Environment Variables — MERP'
slug: 'env-variables'
category: 'reference'
status: 'active'
version: '1.0.0'
owner: '@docs-maintainer'
reviewers: ['@tech-lead']
module: 'reference'
tags: ['env', 'environment', 'variables', 'config', 'docker']
audience: ['dev', 'qa', 'devops', 'support']
created: '2026-10-10'
updated: '2026-10-10'
review-cycle: 'quarterly'
related: []
replaces: []
replaced-by: null
---

# Environment Variables — MERP

Todas as variáveis de ambiente usadas pelo projeto. Template oficial: `.env.example`.

## Classificação

| Prefixo    | Escopo         | Descrição                                                      |
| ---------- | -------------- | -------------------------------------------------------------- |
| (nenhum)   | App runtime    | Lidas pelo código da aplicação (Nitro/Better Auth)             |
| `DB_`      | Docker Compose | Usadas apenas no `docker-compose.yml` para configurar Postgres |
| `NODE_ENV` | Runtime        | `development` \| `production` \| `test`                        |

## Variáveis Obrigatórias (Produção)

| Variável             | Descrição                                                                           | Exemplo                                    | Validação                                           |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| `DATABASE_URL`       | Owner role (superuser) — **apenas migrações**; nunca chega no container app         | `postgres://merp:senha@host:5432/merp`     | Fail-closed no boot se ausente em prod              |
| `APP_DATABASE_URL`   | App role (`merp_app`, non-superuser) — **obrigatória** em produção para RLS vigorar | `postgres://merp_app:senha@host:5432/merp` | Fail-closed no boot (AUD-11)                        |
| `BETTER_AUTH_SECRET` | Segredo Better Auth (>= 32 chars) — assina cookies/tokens                           | `openssl rand -base64 32`                  | Fail-closed no boot (AUD-24)                        |
| `BETTER_AUTH_URL`    | Domínio público real — links de verificação/reset de senha                          | `https://seu-dominio.com`                  | Fail-closed no boot; nunca localhost em prod        |
| `CORS_ORIGIN`        | Domínio público — baked no build (`nuxt.config.ts`) + runtime (trustedOrigins)      | `https://seu-dominio.com`                  | Fail-closed no build se prod (AUD-05)               |
| `CSRF_SECRET`        | Segredo CSRF double-submit (>= 32 chars)                                            | `openssl rand -base64 32`                  | Fail-closed no boot                                 |
| `RESEND_API_KEY`     | Chave Resend — entrega o email de verificação e o de reset                          | `re_...`                                   | Fail-closed no boot (sem ela o signup trava em 403) |
| `RESEND_FROM`        | Remetente dos emails transacionais                                                  | `no-reply@seu-dominio.com`                 | Fail-closed no boot                                 |

## Variáveis Opcionais

| Variável              | Descrição                                     | Default                           | Notas                                                                                 |
| --------------------- | --------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| `TRUST_PROXY`         | `true` se atrás de nginx/Cloudflare           | `false`                           | Se `true`, `TRUSTED_PROXY_CIDRS` obrigatório                                          |
| `TRUSTED_PROXY_CIDRS` | CIDR exato do proxy (Docker: `172.28.0.0/16`) | (obrigatório se TRUST_PROXY=true) | Fail-closed se proxy=true sem CIDRS. Em cloud, descobrir pelo runbook `deploy-secure` |
| `PORT`                | Porta do servidor                             | `3000`                            | Fixado em 3000 no compose prod                                                        |
| `HOST`                | Bind address                                  | `0.0.0.0`                         |                                                                                       |
| `LOG_LEVEL`           | Nível de log (debug/info/warn/error)          | `info`                            | Via `shared/logger.ts`                                                                |
| `DB_PORT`             | Porta Postgres (host access)                  | `5432`                            | Para `docker compose` apenas                                                          |
| `NODE_ENV`            | Ambiente                                      | `development`                     | `production` em prod                                                                  |

## Variáveis Docker Compose (Apenas no compose)

| Variável      | Descrição                   | Default |
| ------------- | --------------------------- | ------- |
| `DB_USER`     | Postgres superuser          | `merp`  |
| `DB_PASSWORD` | Postgres superuser password | `merp`  |
| `DB_NAME`     | Database name               | `merp`  |

## Setup Local

```bash
# 1. Copie o template
cp .env.example .env

# 2. Edite com valores reais (pelo menos DATABASE_URL, BETTER_AUTH_SECRET, CORS_ORIGIN)
#    Para dev local, pode usar:
#    DATABASE_URL=postgres://merp:merp@localhost:5432/merp
#    APP_DATABASE_URL=postgres://merp_app:merp@localhost:5432/merp
#    BETTER_AUTH_SECRET=$(openssl rand -base64 32)
#    CORS_ORIGIN=http://localhost:3000
#    BETTER_AUTH_URL=http://localhost:3000
#    CSRF_SECRET=$(openssl rand -base64 32)

# 3. Suba Postgres
docker compose up -d postgres

# 4. Rode migrações completas
npm run db:migrate:full

# 5. Inicie dev server
npm run dev
```

## Produção (Docker Compose Prod)

O `docker-compose.prod.yml` usa **fail-closed** (`${VAR:?}`) — todas as variáveis acima devem estar definidas no ambiente (`.env` ou segredos do orchestrator). O arquivo `.env` **não** é injetado inteiro no container app (AUD-26) — apenas as variáveis declaradas em `environment:` entram.

## Segurança

- **NUNCA** commitar `.env` real (já no `.gitignore`)
- `BETTER_AUTH_SECRET` e `CSRF_SECRET`: gere com `openssl rand -base64 32` (64 chars)
- `DATABASE_URL` (owner) e `APP_DATABASE_URL` (app): credenciais diferentes
- `TRUSTED_PROXY_CIDRS`: deve corresponder exatamente ao subnet da rede Docker (`172.28.0.0/16` no compose prod)

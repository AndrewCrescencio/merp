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

| Variável              | Descrição                                                                                                       | Default                           | Notas                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `TRUST_PROXY`         | `true` se atrás de nginx/Cloudflare                                                                             | `false`                           | Se `true`, `TRUSTED_PROXY_CIDRS` obrigatório                                                                       |
| `TRUSTED_PROXY_CIDRS` | Lista das faixas de IP dos proxies em que confiamos (notação CIDR, várias por vírgula). Docker: `172.28.0.0/16` | (obrigatório se TRUST_PROXY=true) | Fail-closed se proxy=true sem CIDRS. Em cloud, descobrir pelo runbook `deploy-secure`. Ver [Segurança](#segurança) |
| `PORT`                | Porta do servidor                                                                                               | `3000`                            | Fixado em 3000 no compose prod                                                                                     |
| `HOST`                | Bind address                                                                                                    | `0.0.0.0`                         |                                                                                                                    |
| `LOG_LEVEL`           | Nível de log (debug/info/warn/error)                                                                            | `info`                            | Via `shared/logger.ts`                                                                                             |
| `DB_PORT`             | Porta Postgres (host access)                                                                                    | `5432`                            | Para `docker compose` apenas                                                                                       |
| `NODE_ENV`            | Ambiente                                                                                                        | `development`                     | `production` em prod                                                                                               |

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
- `TRUSTED_PROXY_CIDRS`: deve corresponder ao proxy real (no compose prod,
  `172.28.0.0/16`, a subnet da rede Docker) — ver os dois tópicos abaixo

### O que é um CIDR

CIDR (Classless Inter-Domain Routing) é a **notação de faixa de IP**. O número
depois da barra diz quantos bits do endereço são fixos:

| Entrada         | Significado                                     |
| --------------- | ----------------------------------------------- |
| `172.28.0.0/16` | de `172.28.0.0` a `172.28.255.255` (65 536 IPs) |
| `10.0.0.0/8`    | a rede `10.x.x.x` inteira                       |
| `127.0.0.1/32`  | apenas esse IP (`/32` fixa tudo = 1 endereço)   |
| `::1/128`       | o mesmo, em IPv6                                |

### O que é `TRUSTED_PROXY_CIDRS`

`X-Forwarded-For` é o cabeçalho que um proxy escreve para dizer "este é o IP
real do cliente". Mas ele vem **dentro da requisição** — qualquer cliente pode
mandá-lo forjado. Confiar nele às cegas deixaria um atacante escolher o próprio
IP, contornando o rate limit por IP e poluindo a auditoria.

`TRUSTED_PROXY_CIDRS` é a **lista de faixas de IP dos proxies em que
confiamos**. O app só lê `X-Forwarded-For` quando **quem abriu a conexão TCP
direto** (o "peer imediato", o endereço do socket) está nessa lista.

- Aceita **várias** entradas separadas por vírgula: `127.0.0.1/32,::1/128`
- É **obrigatória** quando `TRUST_PROXY=true` (fail-closed) — sem ela o boot de
  produção é recusado
- Errar o valor **não abre buraco**: o header é ignorado e vale o endereço do
  socket. O risco é o contrário — errar para baixo derruba o rate limit, pois
  todos os clientes cairiam no mesmo bucket `rate:ip:<proxy>`
- Implementação: `server/utils/shared/ip.ts` · como descobrir o valor certo:
  runbook [`deploy-secure`](../05-operations/security/deploy-secure.md)

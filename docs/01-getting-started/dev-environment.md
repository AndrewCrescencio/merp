---
title: "Dev Environment — MERP"
slug: "dev-environment"
category: "guide"
status: "active"
version: "1.0.0"
owner: "@docs-maintainer"
reviewers: ["@tech-lead"]
module: "getting-started"
tags: ["dev-environment", "docker", "env-vars"]
audience: ["dev", "qa", "devops"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "quarterly"
related:
  - "quickstart"
  - "testing-guide"
replaces: []
replaced-by: null
---

# Dev Environment — MERP

## Docker Compose

```yaml
# docker-compose.yml (resumo)
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: merp
      POSTGRES_PASSWORD: merp
      POSTGRES_DB: merp
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U merp -d merp"]
      interval: 5s
      timeout: 5s
      retries: 5
```

## Variáveis de Ambiente Obrigatórias

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `DATABASE_URL` | Owner role (migrações) — **não** chega no container app | `postgres://merp:merp@localhost:5432/merp` |
| `APP_DATABASE_URL` | App role (non-superuser) — **obrigatório** em produção | `postgres://merp_app:xxx@localhost:5432/merp` |
| `BETTER_AUTH_SECRET` | >= 32 chars — boot falha sem ela | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Domínio público real (links verificação/reset) | `http://localhost:3000` |
| `CORS_ORIGIN` | Domínio público — baked no build + runtime | `http://localhost:3000` |
| `CSRF_SECRET` | >= 32 chars — assina tokens double-submit | `openssl rand -base64 32` |
| `RESEND_API_KEY` | `re_...` — emails transacionais | `re_abc123` |
| `RESEND_FROM` | `no-reply@seu-dominio.com` | `no-reply@merp.com.br` |
| `TRUST_PROXY` | `true` atrás de nginx/Cloudflare | `true` |
| `TRUSTED_PROXY_CIDRS` | CIDR do subnet da rede Docker | `172.28.0.0/16` |

## Desenvolvimento Local

```bash
# 1. Suba apenas postgres
docker compose up -d postgres

# 2. Rode migrações
pnpm db:migrate:full

# 3. Dev server com hot reload
pnpm dev

# 4. Drizzle Studio (opcional)
pnpm drizzle-kit studio
```

## Debugging

### Logs Estruturados

```bash
# Ver logs no terminal
pnpm dev 2>&1 | jq .
```

### Inspecionar Banco

```bash
# psql direto
docker compose exec postgres psql -U merp -d merp

# Ou Drizzle Studio
pnpm drizzle-kit studio
```

### Testes de Integração

```bash
# Requer DATABASE_URL apontando para test DB
DB_AVAILABLE=true pnpm test
```

## Troubleshooting Comum

| Problema | Causa | Solução |
|----------|-------|---------|
| `BETTER_AUTH_SECRET` missing | `.env` não configurado | `cp .env.example .env` e preencher |
| `permission denied for table` | Grants `merp_app` faltando | `pnpm db:migrate:full` (aplica migration 0020) |
| `RLS BYPASS DETECTED` no canary | Testes rodando como owner | Verificar `APP_DATABASE_URL` = `merp_app` |
| `CORS_ORIGIN` mismatch | Build com origin errado | `CORS_ORIGIN=http://localhost:3000 pnpm build` |
| Email não envia | `RESEND_API_KEY` inválido | Verificar chave no Resend dashboard |
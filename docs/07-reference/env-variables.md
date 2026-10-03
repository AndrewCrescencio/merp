---
title: "Environment Variables — MERP"
slug: "env-variables"
category: "reference"
status: "active"
version: "1.0.0"
owner: "@devops"
reviewers: ["@tech-lead"]
module: "reference"
tags: ["env", "variables", "config", "production"]
audience: ["dev", "devops", "qa"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "quarterly"
related:
  - "dev-environment"
  - "cli-commands"
replaces: []
replaced-by: null
---

# Environment Variables — MERP

## Obrigatórias (Produção)

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `DATABASE_URL` | Owner role (migrações) — **não** chega no container app | `postgres://merp:xxx@db:5432/merp` |
| `APP_DATABASE_URL` | App role (non-superuser) — **obrigatório** em produção | `postgres://merp_app:xxx@db:5432/merp` |
| `BETTER_AUTH_SECRET` | >= 32 chars — boot falha sem ela | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Domínio público real (links verificação/reset) | `https://app.merp.com.br` |
| `CORS_ORIGIN` | Domínio público — baked no build + runtime | `https://app.merp.com.br` |
| `CSRF_SECRET` | >= 32 chars — assina tokens double-submit | `openssl rand -base64 32` |
| `RESEND_API_KEY` | `re_...` — emails transacionais | `re_abc123` |
| `RESEND_FROM` | `no-reply@seu-dominio.com` | `no-reply@merp.com.br` |
| `TRUST_PROXY` | `true` atrás de nginx/Cloudflare | `true` |
| `TRUSTED_PROXY_CIDRS` | CIDR do subnet da rede Docker | `172.28.0.0/16` |

## Opcionais / Desenvolvimento

| Variável | Default | Descrição |
|----------|---------|-----------|
| `NODE_ENV` | `development` | `production` / `development` / `test` |
| `PORT` | `3000` | Porta do servidor Nuxt |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `HIBP_API_URL` | `https://api.pwnedpasswords.com` | Endpoint HIBP (pode mockar em teste) |

## Geração de Segredos

```bash
# BETTER_AUTH_SECRET / CSRF_SECRET (32+ chars)
openssl rand -base64 32

# Ou com pnpm
pnpm exec -- openssl rand -base64 32
```

## Validação no Boot

`server/plugins/validate-env.ts` valida na inicialização:
- Falha se `BETTER_AUTH_SECRET` ausente ou < 32 chars
- Falha se `APP_DATABASE_URL` ausente em produção (`NODE_ENV=production`)
- Falha se `CORS_ORIGIN` ausente em produção
- Warning se `RESEND_API_KEY` ausente (email opcional em dev)
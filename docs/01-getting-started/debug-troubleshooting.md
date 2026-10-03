---
title: "Debug & Troubleshooting — MERP"
slug: "debug-troubleshooting"
category: "guide"
status: "active"
version: "1.0.0"
owner: "@tech-lead"
reviewers: ["@devops"]
module: "getting-started"
tags: ["debug", "troubleshooting", "errors"]
audience: ["dev", "qa", "devops", "support"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "quarterly"
related:
  - "quickstart"
  - "dev-environment"
replaces: []
replaced-by: null
---

# Debug & Troubleshooting — MERP

## Problemas Comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| `BETTER_AUTH_SECRET` missing | `.env` não configurado | `cp .env.example .env` e preencher |
| `permission denied for table` | Grants `merp_app` faltando | `pnpm db:migrate:full` (aplica migration 0020) |
| `RLS BYPASS DETECTED` no canary | Testes rodando como owner | Verificar `APP_DATABASE_URL` = `merp_app` |
| `CORS_ORIGIN` mismatch | Build com origin errado | `CORS_ORIGIN=http://localhost:3000 pnpm build` |
| Email não envia | `RESEND_API_KEY` inválido | Verificar chave no Resend dashboard |
| `503 auth_unavailable` | Better Auth falhou ao iniciar | Verificar `BETTER_AUTH_SECRET`, `DATABASE_URL` |
| `session_expired` 401 | Sessão expirou (7d TTL fixo) | Re-login obrigatório |

## Logs Estruturados

```bash
# Ver logs no terminal (JSON)
pnpm dev 2>&1 | jq .
```

## Inspecionar Banco

```bash
# psql direto
docker compose exec postgres psql -U merp -d merp

# Drizzle Studio
pnpm drizzle-kit studio
```

## Migrações

```bash
# Nova migração
pnpm drizzle-kit generate --name <nome>

# Aplicar tudo (Drizzle + RLS custom)
pnpm db:migrate:full
```
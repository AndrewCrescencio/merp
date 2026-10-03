---
title: "Quickstart — MERP"
slug: "quickstart"
category: "guide"
status: "active"
version: "1.0.0"
owner: "@docs-maintainer"
reviewers: ["@tech-lead"]
module: "getting-started"
tags: ["quickstart", "onboarding"]
audience: ["dev", "qa"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "quarterly"
related:
  - "dev-environment"
  - "testing-guide"
replaces: []
replaced-by: null
---

# Quickstart — MERP

> Tempo estimado: 10 min | Pré-requisitos: Docker, Node 20+, pnpm 9+

## 1. Clone e Instale

```bash
git clone https://github.com/seu-org/merp.git
cd merp
pnpm install
```

## 2. Variáveis de Ambiente

```bash
cp .env.example .env
# Edite .env com valores reais:
# DATABASE_URL, BETTER_AUTH_SECRET, CORS_ORIGIN, CSRF_SECRET, RESEND_API_KEY, RESEND_FROM
```

## 3. Suba o Banco

```bash
docker compose up -d postgres
```

## 4. Migrações Completas

```bash
pnpm db:migrate:full
```

> ⚠️ **Sempre use `db:migrate:full`** — aplica migrações Drizzle + RLS policies customizadas (ver `scripts/apply-custom-sql.ts`).

## 5. Dev Server

```bash
pnpm dev
# → http://localhost:3000
```

## 6. Testes

```bash
pnpm test        # Unit + integração (Vitest)
pnpm test:watch  # Watch mode
```

## 7. Lint / Format

```bash
pnpm lint        # ESLint + Prettier check
pnpm format      # Prettier write
```

## Estrutura Principal

```
server/
├── api/                    # Endpoints (auth, health, metrics)
├── middleware/             # auth, csrf, no-store, pii-audit
├── tasks/                  # Scheduled tasks (purge, email queue)
├── utils/
│   ├── schema/             # Drizzle tables por feature
│   ├── shared/             # errors, security, audit, background, email
│   └── auth/               # Vertical slices (identity, company, invite)
shared/
├── auth.ts                 # Better Auth instance (lazy, 503 se falhar)
└── logger.ts               # Structured logging (PII-safe)
```

## Próximos Passos

- [Dev Environment](dev-environment.md) — Detalhes de Docker, env vars, debugging
- [Testing Guide](testing-guide.md) — Patterns, factories, CI
- [Architecture Overview](../00-overview/architecture-overview.md) — Visão geral do sistema
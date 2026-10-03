---
title: "CLI Commands — MERP"
slug: "cli-commands"
category: "reference"
status: "active"
version: "1.0.0"
owner: "@devops"
reviewers: ["@tech-lead"]
module: "reference"
tags: ["cli", "commands", "pnpm", "drizzle"]
audience: ["dev", "devops", "qa"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "quarterly"
related:
  - "dev-environment"
replaces: []
replaced-by: null
---

# CLI Commands — MERP

## Desenvolvimento

```bash
# Dev server com hot reload
pnpm dev

# Build de produção
pnpm build

# Preview do build
pnpm preview

# Generate types (Nuxt)
pnpm postinstall
```

## Banco de Dados

```bash
# Migrações completas (Drizzle + RLS custom)
pnpm db:migrate:full

# Apenas Drizzle (journal apenas)
pnpm drizzle-kit migrate

# Nova migração Drizzle
pnpm drizzle-kit generate --name <nome>

# Drizzle Studio
pnpm drizzle-kit studio

# Push schema (dev only)
pnpm drizzle-kit push
```

## Testes

```bash
# Todos (unit + integration)
pnpm test

# Watch mode
pnpm test:watch

# Apenas unit
pnpm test -- --reporter=verbose

# Integração (requer DB)
DB_AVAILABLE=true pnpm test
```

## Qualidade de Código

```bash
# Lint (ESLint + Prettier)
pnpm lint

# Lint + fix
pnpm lint:fix

# Format
pnpm format

# Format check
pnpm format:check

# Type check (via build)
pnpm build
```

## Documentação

```bash
# Validar frontmatter
pnpm run docs:validate

# Verificar links
pnpm run docs:links

# Gerar índice + mkdocs.yml
pnpm run docs:index

# Novo doc a partir de template
pnpm run docs:new <template> <slug> "Título"

# Marcar como deprecated
pnpm run docs:deprecate <slug> <new-slug>

# Arquivar (move para _archive/ + tag git)
pnpm run docs:archive <slug>

# Lint markdown
pnpm run docs:lint

# Spell check
pnpm run docs:spell

# CI completo
pnpm run docs:ci
```

## Docker

```bash
# Subir postgres
docker compose up -d postgres

# Ver logs
docker compose logs -f postgres

# Derrubar tudo
docker compose down -v
```
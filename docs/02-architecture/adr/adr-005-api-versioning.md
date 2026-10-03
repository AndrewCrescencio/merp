---
title: "API Versioning — /api/v1 desde já"
slug: "adr-005-api-versioning"
category: "adr"
status: "deferred"
version: "1.0.0"
owner: "@api-owner"
reviewers: ["@tech-lead", "@frontend-lead"]
module: "cross-cutting"
tags: ["architecture", "decision", "api", "versioning"]
audience: ["dev", "architect", "frontend"]
created: "2026-09-22"
updated: "2026-09-22"
review-cycle: "on-change"
related:
  - "adr-001-vertical-strategy"
replaces: []
replaced-by: null
---

# ADR-005: API Versioning — /api/v1 desde já

## Decisão

Adotar `/api/v1` prefixo em todos os endpoints novos a partir de agora.

## Alternativa Rejeitada

Esperar primeiro consumidor externo para versionar.

## Motivo

- Contrato estável desde o início evita breaking changes silenciosos.
- Facilita depreciação futura (`/api/v2`).
- Documentação OpenAPI gerada por versão.
- Clientes internos (frontend Nuxt) já consomem via `/api/*` — migrar para `/api/v1/*` é mudança única.

## Plano de Migração

1. Novos endpoints: `/api/v1/...`
2. Endpoints existentes (`/api/auth/*`, `/api/health`, `/api/metrics`): manter sem versionamento até v2 (são estáveis, auth é contrato próprio).
3. Documentar em `contracts/auth-api.md` que auth permanece em `/api/auth` (exceção deliberada).

---
title: "ADR Index"
slug: "adr-index"
category: "reference"
status: "active"
version: "1.0.0"
owner: "@tech-lead"
reviewers: ["@architect"]
module: "architecture"
tags: ["adr", "index", "decisions"]
audience: ["dev"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "on-change"
related: []
replaces: []
replaced-by: null
---

# ADR Index

Índice de Architecture Decision Records (ADRs) do MERP.

| ADR | Título | Status | Data | Superseded By |
|-----|--------|--------|------|---------------|
| [ADR-001](adr-001-vertical-strategy.md) | Estratégia Vertical — Núcleo Comum + Packs | accepted | 2026-09-22 | — |
| [ADR-002](adr-002-location-scope.md) | Location Scope em RLS | accepted | 2026-09-22 | — |
| [ADR-003](adr-003-money-numeric-vs-cents.md) | Money: Numeric vs Cents | accepted | 2026-09-22 | — |
| [ADR-004](adr-004-session-ttl-by-profile.md) | Session TTL por Perfil | accepted | 2026-09-22 | — |
| [ADR-005](adr-005-api-versioning.md) | API Versioning | deferred | 2026-09-22 | — |
| [ADR-006](adr-006-id-type-uuid.md) | ID Type: UUID | accepted | 2026-09-22 | — |
| [ADR-007](adr-007-test-suite-runs-as-merp-app.md) | Test Suite Runs as merp_app | accepted | 2026-09-22 | — |
| [ADR-008](adr-008-vertical-slices-package-by-feature.md) | Vertical Slices (Package by Feature) | accepted | 2026-09-22 | — |
| [ADR-009](adr-009-better-auth-adapter-origin.md) | Better Auth Adapter Origin | accepted | 2026-09-22 | — |
| [ADR-010](adr-010-2fa-deferred.md) | 2FA Deferred | deferred | 2026-09-22 | — |

## Como Adicionar Nova ADR

1. `pnpm run docs:new adr adr-XXX-slug "Título da Decisão"`
2. Preencher template seguindo estrutura
3. Adicionar linha na tabela acima
4. PR com revisão de 2+ owners (ver `CODEOWNERS`)
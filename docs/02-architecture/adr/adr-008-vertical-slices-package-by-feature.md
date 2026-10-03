---
title: "Vertical Slices (Package by Feature)"
slug: "adr-008-vertical-slices-package-by-feature"
category: "adr"
status: "accepted"
version: "1.0.0"
owner: "@tech-lead"
reviewers: ["@backend-lead", "@architect"]
module: "cross-cutting"
tags: ["architecture", "decision", "vertical-slices", "package-by-feature"]
audience: ["dev", "architect", "backend"]
created: "2026-09-22"
updated: "2026-09-22"
review-cycle: "on-change"
related:
  - "adr-001-vertical-strategy"
  - "adr-002-location-scope"
replaces: []
replaced-by: null
---

# ADR-008: Vertical Slices (Package by Feature)

## Status

Aceito e implementado (fases 1–4; fases 5–6 pendentes)

## Contexto

Auth nasceu com um "god repository" (`server/utils/auth/repository.ts`, 881
linhas) cobrindo 5 subdomínios. Detalhamento completo em
`specs/002-vertical-slices/architecture.md`.

## Decisão

Adotar **package by feature** dentro de `server/utils/auth/`:
`identity/`, `company/`, `invite/`; cross-feature em `server/utils/shared/`.
Regras de ouro (import cruzado proibido, feature > 10 métodos exige
justificativa, schema com registry único) estão em §3.3 do architecture.md.

## Consequências

- Mocks de teste por feature (ISP).
- Novo contexto (`fiscal`, `financeiro`, `order`) nasce vertical.
- `specs/001-auth-context/plan.md` foi atualizado para refletir a estrutura.

## Referências

- `specs/002-vertical-slices/architecture.md` (spec detalhada)

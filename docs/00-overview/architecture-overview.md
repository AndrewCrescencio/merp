---
title: "Architecture Overview — MERP"
slug: "architecture-overview"
category: "guide"
status: "active"
version: "1.0.0"
owner: "@tech-lead"
reviewers: ["@architect"]
module: "overview"
tags: ["architecture", "overview", "vertical-slices", "rls"]
audience: ["dev", "architect", "product"]
created: "2026-10-03"
updated: "2026-10-03"
review-cycle: "quarterly"
related:
  - "adr-001-vertical-strategy"
  - "adr-008-vertical-slices-package-by-feature"
replaces: []
replaced-by: null
---

# Architecture Overview — MERP

## Visão Geral

O MERP segue uma arquitetura **Vertical Slices (Package by Feature)** com **Núcleo Comum + Packs Verticais** (ADR-001).

```
┌─────────────────────────────────────────────┐
│                  Packs                       │
│  ┌─────────┐ ┌────────┐ ┌─────────┐         │
│  │Restaurant│ │Retail  │ │ERP B2B  │ (futuro)│
│  └─────────┘ └────────┘ └─────────┘         │
├─────────────────────────────────────────────┤
│              Núcleo Comum                    │
│  Auth │ Company │ Catalog │ Inventory       │
│  Order │ Payment │ Fiscal  │ Finance │ Audit│
└─────────────────────────────────────────────┘
│            Infraestrutura                    │
│  Nuxt 4 (Nitro) │ Better Auth │ Drizzle     │
│  PostgreSQL + RLS │ Resend │ Docker          │
└─────────────────────────────────────────────┘
```

## Princípios

1. **Vertical Slices**: Cada feature é um slice completo (API → Repo → Schema)
2. **Tenant Isolation**: RLS no PostgreSQL + `withTenant` no app (fail-closed)
3. **Multi-tenancy**: `company_id` em toda tabela tenant-scoped
4. **Security by Default**: CSRF, rate limiting, PII audit, LGPD compliance
5. **Type Safety**: TypeScript end-to-end, Zod para validação

## Camadas

| Camada | Responsabilidade | Localização |
|--------|------------------|-------------|
| API | HTTP handlers, validação, serialização | `server/api/` |
| Repo | Business logic, queries, transações | `server/utils/auth/<feature>/repository.ts` |
| Schema | Drizzle tables, relations, constraints | `server/utils/schema/<feature>.ts` |
| Shared | Utils cross-cutting (auth, email, security) | `server/utils/shared/` |
| Middleware | Auth, CSRF, no-store, PII audit | `server/middleware/` |

## RLS Pattern

Todas as tabelas tenant-scoped têm:
- `company_id NOT NULL` + FK → `company.id`
- Policy `FOR ALL USING (company_id = current_tenant())`
- Fail-closed: GUC ausente → NULL → 0 rows

## Packs Verticais

Habilitados por tenant via `company.enabled_packs` (jsonb) ou tabela `company_pack`.
Ordem: **núcleo → restaurant → retail → erp-b2b** (ADR-001).
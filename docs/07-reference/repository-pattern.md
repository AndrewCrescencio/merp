---
title: "Padrão de Repository — MERP"
slug: "repository-pattern"
category: "reference"
status: "active"
version: "1.0.0"
owner: "@tech-lead"
reviewers: ["@architect"]
module: "architecture"
tags: ["repository", "pattern", "architecture", "vertical-slice"]
audience: ["dev", "architect"]
created: "2026-10-10"
updated: "2026-10-10"
review-cycle: "quarterly"
related:
  - "context-map"
  - "create-endpoint-guide"
  - "specs/decisions/ADR-008-vertical-slices-package-by-feature.md"
replaces: []
replaced-by: null
---

# Padrão de Repository — MERP

Documenta os 3 padrões de repository que coexistem no codebase e a recomendação para novos contextos.

---

## Padrões Existentes

| Padrão | Contextos | Descrição |
|--------|-----------|-----------|
| **Object + type alias** (recomendado p/ novos) | Restaurant, Order, Print | `export const repository = { async method() {} }` + `export type Repository = typeof repository` |
| **Class + singleton** | Company, Invite, Membership | `export class Repository { async method() {} }` + `export const repository = new Repository()` |
| **Functions (via Better Auth)** | Identity | `export async function method() {}` em `queries.ts` — delega para Better Auth |

---

## Recomendação para Novos Contextos

**Use Object + type alias** (menos boilerplate, mesmo poder, tipagem estrutural).

```ts
// server/utils/novo-contexto/repository.ts
import { withTenant } from '#shared/db/tenant-context'
import { db } from '#shared/db'
import { tabela } from '#shared/schema'

export const novoRepository = {
  async metodo({ companyId, locationId, userId, ...params }) {
    return withTenant(companyId, locationId, userId, async (tx) => {
      // queries Drizzle usando tx
    })
  }
}

// Type alias para tipagem estrutural (opcional, para handlers)
export type NovoRepository = typeof novoRepository
```

**Handler usa direto:**
```ts
import { novoRepository } from '#shared/utils/novo-contexto'

export default defineAuthHandler(async (event) => {
  const { companyId, locationId, userId } = event.context.auth
  return novoRepository.metodo({ companyId, locationId, userId, ... })
})
```

---

## Por Que Não Interfaces `IRepository`?

- **YAGNI**: Interface só se houver 2+ implementações reais (ex: fake para testes, adapter diferente)
- Hoje: 1 implementação por contexto → interface = boilerplate inútil
- Tipagem estrutural (`typeof repository`) já garante contrato entre handler e repo

---

## Regras de Ouro

1. **`withTenant` obrigatório** — 3 IDs: `companyId`, `locationId`, `userId`
2. **Repository usa `tx`** — nunca `db` direto
3. **Schema com `companyId` + `locationId` NOT NULL** — RLS policy correspondente
4. **Handler → Repository → Drizzle** — sem Service layer
5. **Menos de 10 métodos por repo** — se passar, dividir (ex: Company → Company + Membership)

---

## Migração Existente (Não Obrigatória)

| Contexto Atual | Padrão Atual | Ação Futura |
|----------------|--------------|-------------|
| Company | Class + singleton | Dividido em Company + Membership (feito) |
| Invite | Class + singleton | Manter (10 métodos, 1 tabela) |
| Identity | Functions (Better Auth) | Manter (delega para Better Auth) |
| Restaurant | Object + type alias | ✅ Padrão recomendado |
| Order | Object + type alias | ✅ Padrão recomendado |
| Print | Object + type alias | ✅ Padrão recomendado |

---

## Referências

- `docs/07-reference/context-map.md` — Mapa de contextos com status
- `docs/07-reference/create-endpoint-guide.md` — Tutorial prático handler → repo
- `specs/decisions/ADR-008-vertical-slices-package-by-feature.md` — Vertical slices
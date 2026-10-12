---
title: 'Modelo de Dados: Context'
slug: 'data-model-context'
category: 'reference'
status: 'active'
version: '1.0.0'
owner: '@handle'
reviewers: ['@handle']
module: 'context'
tags: ['schema', 'drizzle', 'rls']
audience: ['dev']
created: '2026-01-01'
updated: '2026-01-01'
review-cycle: 'on-change'
related:
  - 'spec-context'
replaces: []
replaced-by: null
---

# Modelo de Dados: <Context>

## Diagrama ER (Mermaid)

```mermaid
erDiagram
  USER ||--o{ COMPANY_MEMBER : belongs_to
  COMPANY ||--o{ COMPANY_MEMBER : has
```

## Tabelas

### `table_name`

| Coluna     | Tipo | Nullable | Default           | Constraints          | Descrição    |
| ---------- | ---- | -------- | ----------------- | -------------------- | ------------ |
| id         | text | N        | gen_random_uuid() | PK                   |              |
| company_id | text | N        |                   | FK → company.id, RLS | Tenant scope |
| ...        |      |          |                   |                      |              |

**Índices:** `CREATE INDEX ...`
**RLS Policies:** `policy_name` — `USING (company_id = get_tenant_id())`

## Migrações Relacionadas

- `drizzle/00XX_<name>.sql` — descrição

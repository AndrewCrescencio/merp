---
title: "API Contract: Context"
slug: "api-context"
category: "api"
status: "active"
version: "1.0.0"
owner: "@handle"
reviewers: ["@handle"]
module: "context"
tags: ["api", "contract", "openapi"]
audience: ["dev", "qa"]
created: "2026-01-01"
updated: "2026-01-01"
review-cycle: "on-change"
related:
  - "spec-context"
  - "data-model-context"
replaces: []
replaced-by: null
---

# API: <Context>

> Base path: `/api/<context>`
> Auth: Bearer token (session cookie) + CSRF header
> Rate limit: 60 req/min per user (sliding window)
> Errors: `{ "error": "code", "message": "human", "details?" }`

## Endpoints

### `GET /api/<context>/resources`

**Descrição:** Lista recursos com paginação/filtro.

**Query Params:**

| Param | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| page | integer | N | Página (default 1) |
| limit | integer | N | Itens por página (default 20, max 100) |
| q | string | N | Busca textual |
| sort | string | N | Campo:direção (ex: `created_at:desc`) |

**Response 200:**

```json
{
  "data": [{ "id": "...", "name": "..." }],
  "meta": { "page": 1, "limit": 20, "total": 42 }
}
```

**Erros:** `401` (unauthenticated), `403` (forbidden), `429` (rate limit)

---

### `POST /api/<context>/resources`

**Descrição:** Cria recurso.

**Request Body:**

```json
{ "name": "string", "sku": "string?", "price": "number" }
```

**Validação:** `name` required, 1-200 chars; `sku` unique per company; `price` >= 0

**Response 201:** Recurso criado (mesmo shape do GET single)

**Erros:** `400` (validation), `409` (sku conflict), `422` (business rule)

---

## Códigos de Erro Específicos

| Código | HTTP | Quando |
|--------|------|--------|
| `sku_conflict` | 409 | SKU já existe na company |
| `insufficient_stock` | 422 | Tentativa de vender sem estoque |

## Exemplos (cURL)

```bash
curl -X POST "https://api.merp.com/api/catalog/products" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -d '{"name":"Produto X","sku":"PRD-X","price":99.90}'
```
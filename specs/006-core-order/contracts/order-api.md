# Order API Contracts

Base path: `/api/v1/orders`

Versionamento: `/api/v1` desde já (ADR-005).

Erro padrão: `{ "error": "snake_case_code", "message": "Human-readable message", "details?": {} }`

Rate limits: IP 20/min, email 5/min, user 60/min (sliding window). 429 com `Retry-After`.

CSRF: todos POST/PATCH/DELETE exigem `x-csrf-token` header.

Idempotency: `Idempotency-Key` header obrigatório em POST /api/v1/orders.

---

## POST /api/v1/orders

Cria uma nova ordem.

**Auth**: Required (session cookie + CSRF)

**Headers**: `Idempotency-Key` (UUID v7)

**Request Body**:

```json
{
  "order_type": "dine_in",
  "location_id": "uuid",
  "customer_id": "uuid",
  "notes": "Mesa 5, sem glúten",
  "items": [
    { "product_id": "uuid", "quantity": 2, "unit_price": 29.9, "discount_applied": 0 },
    { "product_id": "uuid", "quantity": 1, "unit_price": 15.0, "discount_applied": 2.0 }
  ]
}
```

`unit_price` no body é **referência apenas** — servidor usa price_list vigente e snapshot no item. Cliente NÃO envia `total_amount`.

**Success Response**: `201 Created`

```json
{
  "id": "uuid",
  "order_type": "dine_in",
  "status": "open",
  "total_amount": "74.80",
  "items": [
    {
      "id": "uuid",
      "product_name": "Pizza Margherita",
      "unit_price": "29.90",
      "quantity": 2,
      "line_total": "59.80"
    },
    {
      "id": "uuid",
      "product_name": "Refrigerante",
      "unit_price": "15.00",
      "quantity": 1,
      "line_total": "13.00"
    }
  ],
  "created_at": "2026-09-22T10:00:00Z"
}
```

**Error Responses**:
| Status | Error Code | Condition |
|--------|------------|-----------|
| 400 | validation_error | order_type inválido, location_id obrigatório, items vazio, quantity ≤ 0 |
| 401 | unauthorized | Sem sessão |
| 403 | csrf_invalid | CSRF token ausente/inválido |
| 409 | conflict | Idempotency-Key já processada (retorna resposta original) |
| 422 | invalid_transition | N/A na criação |
| 429 | rate_limit_exceeded | Rate limit excedido |
| 503 | service_unavailable | DB indisponível |

---

## GET /api/v1/orders

Lista ordens com paginação cursor-based.

**Auth**: Required (session cookie)

**Query Parameters**: `cursor` (opaque), `limit` (default 50, max 100), `status` (filter), `order_type` (filter), `customer_id` (filter)

**Success Response**: `200 OK`

```json
{
  "orders": [
    {
      "id": "uuid",
      "order_type": "dine_in",
      "status": "completed",
      "total_amount": "74.80",
      "customer_id": "uuid",
      "created_at": "..."
    },
    {
      "id": "uuid",
      "order_type": "retail_pos",
      "status": "open",
      "total_amount": "150.00",
      "customer_id": null,
      "created_at": "..."
    }
  ],
  "next_cursor": "opaque_cursor_or_null"
}
```

**Error Responses**: 401, 429, 503

---

## GET /api/v1/orders/:id

Detalha uma ordem com itens e satélite.

**Auth**: Required (session cookie)

**Success Response**: `200 OK`

```json
{
  "id": "uuid",
  "order_type": "dine_in",
  "status": "preparing",
  "location_id": "uuid",
  "customer_id": "uuid",
  "total_amount": "74.80",
  "notes": "Mesa 5, sem glúten",
  "items": [
    { "id": "uuid", "product_id": "uuid", "product_name": "Pizza Margherita", "unit_price": "29.90", "quantity": 2, "tax_snapshot": {...}, "discount_applied": 0, "line_total": "59.80" },
    { "id": "uuid", "product_name": "Refrigerante", "unit_price": "15.00", "quantity": 1, "discount_applied": 2.00, "line_total": "13.00" }
  ],
  "dine_in": { "table_id": "uuid", "cover_count": 2, "waiter_id": "uuid", "opened_at": "..." },
  "created_at": "...",
  "updated_at": "..."
}
```

**Error Responses**: 401, 404 (fora do tenant = 404 genérico), 429, 503

---

## PATCH /api/v1/orders/:id/status

Transição de estado (FSM por order_type).

**Auth**: Required (session cookie + CSRF)

**Request Body**:

```json
{ "status": "confirmed" }
```

Valida transição permitida pelo FSM do `order_type`. Transição inválida → 422.

**Success Response**: `200 OK` — ordem atualizada

**Error Responses**:
| Status | Error Code | Condition |
|--------|------------|-----------|
| 400 | validation_error | status ausente ou inválido |
| 401 | unauthorized | Sem sessão |
| 403 | csrf_invalid | CSRF token |
| 404 | not_found | Ordem não encontrada (ou fora do tenant) |
| 422 | invalid_transition | Transição não permitida (ex.: open → completed) |
| 429 | rate_limit_exceeded | Rate limit |
| 503 | service_unavailable | DB indisponível |

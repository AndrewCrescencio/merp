# Restaurant API Contracts

Base path: `/api/v1/restaurant`

Versionamento: `/api/v1` (ADR-005).

Erro padrão, rate limits, CSRF, idempotency: ver `specs/000-foundation/endpoint-pattern.md` e `specs/006-core-order/contracts/order-api.md`.

---

## POST /api/v1/restaurant/tables/:id/open

Abre uma mesa (cria order dine_in vinculada).

**Auth**: Required (session + CSRF)

**Path Params**: `id` (table uuid)

**Request Body**:

```json
{ "cover_count": 2, "waiter_id": "uuid" }
```

**Success Response**: `201 Created` — retorna order criado com satélite dine_in

**Error Responses**: 400, 401, 403 (csrf), 404 (mesa não existe ou fora do tenant), 409 (mesa já ocupada), 422 (status inválido), 429, 503

---

## POST /api/v1/restaurant/tables/:id/close

Fecha a conta da mesa (transição order para completed).

**Auth**: Required (session + CSRF)

**Path Params**: `id` (table uuid)

**Request Body**: `{ "payment_method": "pix|card|cash", "amount": 100.00 }` — opcional, para registrar pagamento

**Success Response**: `200 OK` — order atualizado para completed

**Error Responses**: 400, 401, 403, 404, 422 (mesa livre ou sem order ativo), 429, 503

---

## POST /api/v1/restaurant/kitchen-tickets/:id/status

Atualiza status do ticket no KDS.

**Auth**: Required (session + CSRF — cozinha usa sessão de terminal)

**Path Params**: `id` (kitchen_ticket uuid)

**Request Body**:

```json
{ "status": "in_progress" }
```

Valida FSM: pending → in_progress → ready → served.

**Success Response**: `200 OK` — ticket atualizado

**Error Responses**: 400, 401, 403, 404, 422 (transição inválida), 429, 503

---

## GET /api/v1/restaurant/kitchen/display?station_id=...

Display do KDS — lista tickets da estação ordenados por prioridade/created_at.

**Auth**: Required (session — terminal KDS)

**Query**: `station_id` (required), `status` (filter: pending,in_progress,ready)

**Success Response**: `200 OK`

```json
{
  "tickets": [
    {
      "id": "uuid",
      "order_id": "uuid",
      "product_name": "Pizza Margherita",
      "quantity": 2,
      "status": "pending",
      "priority": 1,
      "created_at": "..."
    },
    {
      "id": "uuid",
      "product_name": "Batata Frita",
      "quantity": 1,
      "status": "in_progress",
      "priority": 0,
      "created_at": "..."
    }
  ]
}
```

**Error Responses**: 400, 401, 403, 404, 429, 503

---

## POST /api/v1/restaurant/cashier-shift/open

Abre turno de caixa.

**Auth**: Required (session + CSRF)

**Request Body**:

```json
{ "register_id": "uuid", "opening_float": 150.0 }
```

**Success Response**: `201 Created` — cashier_shift criado

**Error Responses**: 400, 401, 403, 409 (turno já aberto para este user/register), 429, 503

---

## POST /api/v1/restaurant/cashier-shift/close

Fecha turno de caixa.

**Auth**: Required (session + CSRF)

**Request Body**:

```json
{ "actual_cash": 1250.5 }
```

Calcula `expected_cash` (vendas do turno - sangrias + opening_float) e `difference`.

**Success Response**: `200 OK` — shift fechado

**Error Responses**: 400, 401, 403, 404 (turno não encontrado), 422 (já fechado), 429, 503

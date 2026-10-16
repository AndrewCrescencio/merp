# Restaurant API Contracts

Base path: `/api/v1/companies/{companyId}/restaurant`

O `companyId` vem do **PATH** (R1/R5) — nunca do body. O middleware `server/middleware/tenant.ts` valida membership antes do handler rodar (não-membro e empresa inexistente respondem o mesmo `404`).

Versionamento: `/api/v1` (ADR-005). Erro padrão, rate limits, CSRF: ver `specs/000-foundation/rest-api.md` (R1–R8).

**Sessão**: todos os endpoints exigem sessão (`server/middleware/auth.ts` aplica `401`). CSRF só para métodos não-GET.

> **Escopo de location (H07 — fechado em 2026-10-16)**: o `locationId` vem de
> `company_member.default_location_id` (ADR-002, migração `0028`), resolvido por
> `resolveLocationId`/`requireLocationId` em `server/utils/shared/location.ts`.
> Membro sem location definido opera em escopo **company** — a RLS permite pelo
> escape `OR get_location_id() IS NULL`, fail-closed entre empresas. Writes
> exigem location real: sem `default_location_id` devolvem 400 acionável em vez
> de violar a FK de `location_id`.

---

## GET /api/v1/companies/{companyId}/restaurant/tables

Lista as mesas da empresa.

**Auth**: session

**Query**: nenhuma

**Success**: `200 OK`

```json
{ "tables": [] }
```

**Errors**: 400, 401, 403, 404, 429, 503

---

## POST /api/v1/companies/{companyId}/restaurant/tables/{tableId}/open

Abre uma mesa.

**Auth**: session + CSRF

**Path Params**: `tableId` (uuid)

**Request Body** (camelCase):

```json
{ "coverCount": 2, "waiterId": "uuid" }
```

`coverCount` e `waiterId` são opcionais.

**Success**: `200 OK` — mesa aberta
**Errors**: 400 (`table_id_required`), 401, 403, 404, 429, 500 (`failed_to_open_table`), 503

> **Pendência R8**: criação deveria devolver `201`. Ver `specs/000-foundation/rest-api.md` §"Status de implementação".

---

## POST /api/v1/companies/{companyId}/restaurant/tables/{tableId}/close

Fecha a conta da mesa.

**Auth**: session + CSRF

**Path Params**: `tableId` (uuid)

**Request Body**: `{}` (sem campos)

**Success**: `200 OK` — mesa fechada
**Errors**: 400 (`table_id_required`, `not occupied`, `not found`), 401, 403, 404, 429, 500 (`failed_to_close_table`), 503

> **Pendência R8**: condição de estado (`mesa livre`) responde `400`; o padrão de transição inválida é `409`.

---

## GET /api/v1/companies/{companyId}/restaurant/kitchen-tickets

Display do KDS — lista tickets, com filtro por status.

**Auth**: session

**Query**:

| Campo    | Tipo                                             | Obrigatório |
| -------- | ------------------------------------------------ | ----------- |
| `status` | `pending\|in_progress\|ready\|served\|cancelled` | não         |
| `limit`  | int (≤ 100)                                      | não         |
| `offset` | int (≥ 0)                                        | não         |

**Success**: `200 OK`

```json
{ "tickets": [] }
```

**Errors**: 400 (`validation_error`), 401, 403, 404, 429, 503

> **Não implementado**: a transição de status do ticket (`pending → in_progress → ready → served`) e o filtro por `station_id` não têm endpoint. Não há `PATCH .../status` — R4 proíbe transição por `PATCH /status`; o formato seria `POST .../kitchen-tickets/{ticketId}/{verbo}`.

---

## GET /api/v1/companies/{companyId}/restaurant/cashier-shifts

Lista turnos de caixa.

**Auth**: session

**Query**:

| Campo    | Tipo                                    | Obrigatório |
| -------- | --------------------------------------- | ----------- |
| `status` | `open\|closed\|reconciled\|discrepancy` | não         |
| `userId` | uuid                                    | não         |
| `limit`  | int (≤ 100)                             | não         |
| `offset` | int (≥ 0)                               | não         |

**Success**: `200 OK`

```json
{ "shifts": [] }
```

**Errors**: 400 (`validation_error`), 401, 403, 404, 429, 503

---

## POST /api/v1/companies/{companyId}/restaurant/cashier-shifts

Abre um turno de caixa.

**Auth**: session + CSRF

**Request Body** (camelCase):

```json
{ "openingFloat": 150.0 }
```

`openingFloat` é **obrigatório** (`400 opening_float_required`).

**Success**: `200 OK` — turno aberto
**Errors**: 400 (`opening_float_required`, `already has an open shift`), 401, 403, 404, 429, 500 (`failed_to_open_cashier_shift`), 503

> **Pendência R8**: criação deveria devolver `201`; turno já aberto responde `400`, o padrão é `409`.

---

## GET /api/v1/companies/{companyId}/restaurant/cashier-shifts/current

Turno aberto do usuário autenticado.

**Auth**: session

**Success**: `200 OK` — turno
**Errors**: 404 (`no_open_shift`), 401, 403, 429, 503

---

## GET /api/v1/companies/{companyId}/restaurant/cashier-shifts/{shiftId}

Turno por id.

**Auth**: session

**Path Params**: `shiftId` (uuid)

**Success**: `200 OK` — turno
**Errors**: 400 (`shift_id_required`), 401, 403, 404 (`cashier_shift_not_found`), 429, 503

---

## POST /api/v1/companies/{companyId}/restaurant/cashier-shifts/{shiftId}/close

Fecha um turno de caixa.

**Auth**: session + CSRF

**Path Params**: `shiftId` (uuid) — vem do **path**, não do body (R1/R5)

**Request Body** (camelCase):

```json
{
  "closingFloat": 150.0,
  "expectedAmount": 1250.5,
  "actualAmount": 1240.0,
  "notes": "string opcional"
}
```

`closingFloat`, `expectedAmount` e `actualAmount` são **obrigatórios** (`400 missing_required_fields`). O cálculo de `expected`/`difference` é responsabilidade do cliente — o handler persiste os valores enviados.

**Success**: `200 OK` — turno fechado
**Errors**: 400 (`missing_required_fields`, `not open`, `not found`), 401, 403, 404 (`cashier_shift_not_found`), 429, 500 (`failed_to_close_cashier_shift`), 503

> **Pendência R8**: "já fechado" responde `400`; o padrão é `409`.

---

## Formato de entidade

Os campos de cada entidade vêm do schema Drizzle em `server/utils/schema/`:

| Entidade           | Schema                |
| ------------------ | --------------------- |
| mesa               | `restaurant-table.ts` |
| ticket de cozinha  | `kitchen-ticket.ts`   |
| estação de cozinha | `kitchen-station.ts`  |
| turno de caixa     | `cashier-shift.ts`    |

Colunas em `snake_case` no banco; os handlers devolvem os objetos do Drizzle (camelCase).

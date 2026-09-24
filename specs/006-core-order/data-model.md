# Data Model: Core Order

## Tabelas

### order

| Campo        | Tipo          | Constraints                                                                              |
| ------------ | ------------- | ---------------------------------------------------------------------------------------- |
| id           | uuid          | PK, default `gen_random_uuid()`                                                          |
| company_id   | uuid          | NOT NULL, FK → company.id                                                                |
| location_id  | uuid          | NOT NULL, FK → location.id                                                               |
| order_type   | text          | NOT NULL, CHECK IN ('dine_in','takeout','delivery','retail_pos','wholesale','quotation') |
| status       | text          | NOT NULL, DEFAULT 'open'                                                                 |
| customer_id  | uuid          | NULLABLE, FK → party.id                                                                  |
| party_id     | uuid          | NULLABLE, FK → party.id                                                                  |
| total_amount | numeric(12,2) | NOT NULL, DEFAULT 0                                                                      |
| currency     | text          | NOT NULL, DEFAULT 'BRL'                                                                  |
| notes        | text          | NULLABLE                                                                                 |
| created_by   | uuid          | NOT NULL, FK → user.id                                                                   |
| created_at   | timestamptz   | NOT NULL, DEFAULT now()                                                                  |
| updated_at   | timestamptz   | NOT NULL, DEFAULT now()                                                                  |
| closed_at    | timestamptz   | NULLABLE                                                                                 |

**Indexes**: `(company_id, location_id, created_at DESC)`, `(company_id, status)`, `(customer_id)`

**Unique**: — (idempotency via tabela separada)

### order_item

| Campo            | Tipo          | Constraints                                                   |
| ---------------- | ------------- | ------------------------------------------------------------- |
| id               | uuid          | PK                                                            |
| order_id         | uuid          | NOT NULL, FK → order.id ON DELETE CASCADE                     |
| product_id       | uuid          | NULLABLE, FK → product.id                                     |
| product_name     | text          | NOT NULL                                                      |
| unit_price       | numeric(12,2) | NOT NULL                                                      |
| quantity         | numeric(12,3) | NOT NULL                                                      |
| tax_snapshot     | jsonb         | NOT NULL                                                      |
| bom_snapshot     | jsonb         | NULLABLE                                                      |
| discount_applied | numeric(12,2) | DEFAULT 0                                                     |
| line_total       | numeric(12,2) | GENERATED ALWAYS AS (round(unit_price \* quantity, 2)) STORED |
| sort_order       | integer       | DEFAULT 0                                                     |
| created_at       | timestamptz   | DEFAULT now()                                                 |

**Indexes**: `(order_id, sort_order)`

### order_dine_in

| Campo       | Tipo        | Constraints                        |
| ----------- | ----------- | ---------------------------------- |
| order_id    | uuid        | PK, FK → order.id                  |
| table_id    | uuid        | NOT NULL, FK → restaurant_table.id |
| cover_count | integer     | DEFAULT 1                          |
| waiter_id   | uuid        | NULLABLE, FK → user.id             |
| opened_at   | timestamptz | NOT NULL, DEFAULT now()            |

### order_takeout

| Campo        | Tipo        | Constraints       |
| ------------ | ----------- | ----------------- |
| order_id     | uuid        | PK, FK → order.id |
| pickup_at    | timestamptz | NULLABLE          |
| pickup_name  | text        | NULLABLE          |
| pickup_phone | text        | NULLABLE          |

### order_delivery

| Campo        | Tipo          | Constraints               |
| ------------ | ------------- | ------------------------- |
| order_id     | uuid          | PK, FK → order.id         |
| address_id   | uuid          | NOT NULL, FK → address.id |
| delivery_fee | numeric(12,2) | DEFAULT 0                 |
| courier_id   | uuid          | NULLABLE, FK → user.id    |
| eta          | timestamptz   | NULLABLE                  |

### order_retail_pos

| Campo          | Tipo | Constraints                    |
| -------------- | ---- | ------------------------------ |
| order_id       | uuid | PK, FK → order.id              |
| register_id    | uuid | NOT NULL, FK → pos_register.id |
| cashier_id     | uuid | NOT NULL, FK → user.id         |
| payment_method | text | NOT NULL                       |

### order_wholesale

| Campo               | Tipo | Constraints               |
| ------------------- | ---- | ------------------------- |
| order_id            | uuid | PK, FK → order.id         |
| po_number           | text | NULLABLE                  |
| payment_terms       | text | NULLABLE                  |
| shipping_address_id | uuid | NULLABLE, FK → address.id |

### order_quotation

| Campo       | Tipo        | Constraints            |
| ----------- | ----------- | ---------------------- |
| order_id    | uuid        | PK, FK → order.id      |
| valid_until | timestamptz | NOT NULL               |
| approved_by | uuid        | NULLABLE, FK → user.id |
| approved_at | timestamptz | NULLABLE               |

## RLS

Todas as tabelas operacionais herdam `company_id` + `location_id` do `order` via JOIN na policy, ou carregam as colunas diretamente (preferível para performance).

Ver `specs/000-foundation/rls-pattern.md` para template normativo.

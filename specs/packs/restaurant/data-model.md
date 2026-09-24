# Data Model: Restaurant Pack

Todas as tabelas incluem `company_id` NOT NULL + `location_id` NOT NULL (ADR-002).

## restaurant_table

| Campo            | Tipo        | Constraints                                                                 |
| ---------------- | ----------- | --------------------------------------------------------------------------- |
| id               | uuid        | PK                                                                          |
| company_id       | uuid        | NOT NULL, FK → company.id                                                   |
| location_id      | uuid        | NOT NULL, FK → location.id                                                  |
| number           | integer     | NOT NULL                                                                    |
| name             | text        | NULLABLE                                                                    |
| capacity         | integer     | DEFAULT 4                                                                   |
| status           | text        | NOT NULL, DEFAULT 'free' CHECK IN ('free','occupied','reserved','cleaning') |
| current_order_id | uuid        | NULLABLE, FK → order.id                                                     |
| created_at       | timestamptz | DEFAULT now()                                                               |
| updated_at       | timestamptz | DEFAULT now()                                                               |

**Indexes**: `(company_id, location_id, number)`, `(company_id, location_id, status)`

## kitchen_ticket

| Campo         | Tipo        | Constraints                                                                                 |
| ------------- | ----------- | ------------------------------------------------------------------------------------------- |
| id            | uuid        | PK                                                                                          |
| company_id    | uuid        | NOT NULL                                                                                    |
| location_id   | uuid        | NOT NULL                                                                                    |
| order_id      | uuid        | NOT NULL, FK → order.id                                                                     |
| order_item_id | uuid        | NOT NULL, FK → order_item.id                                                                |
| station_id    | uuid        | NOT NULL, FK → kitchen_station.id                                                           |
| status        | text        | NOT NULL, DEFAULT 'pending' CHECK IN ('pending','in_progress','ready','served','cancelled') |
| priority      | integer     | DEFAULT 0                                                                                   |
| started_at    | timestamptz | NULLABLE                                                                                    |
| ready_at      | timestamptz | NULLABLE                                                                                    |
| served_at     | timestamptz | NULLABLE                                                                                    |
| created_at    | timestamptz | DEFAULT now()                                                                               |
| updated_at    | timestamptz | DEFAULT now()                                                                               |

**Indexes**: `(company_id, location_id, station_id, status, priority)`, `(order_id)`

## kitchen_station

| Campo         | Tipo    | Constraints  |
| ------------- | ------- | ------------ |
| id            | uuid    | PK           |
| company_id    | uuid    | NOT NULL     |
| location_id   | uuid    | NOT NULL     |
| name          | text    | NOT NULL     |
| display_order | integer | DEFAULT 0    |
| is_active     | boolean | DEFAULT true |

## printer

| Campo       | Tipo        | Constraints                                          |
| ----------- | ----------- | ---------------------------------------------------- |
| id          | uuid        | PK                                                   |
| company_id  | uuid        | NOT NULL                                             |
| location_id | uuid        | NOT NULL                                             |
| name        | text        | NOT NULL                                             |
| driver      | text        | NOT NULL CHECK IN ('escpos','star','epson','custom') |
| connection  | jsonb       | NOT NULL                                             |
| station_ids | uuid[]      | NOT NULL                                             |
| is_active   | boolean     | DEFAULT true                                         |
| created_at  | timestamptz | DEFAULT now()                                        |

## print_job

| Campo             | Tipo        | Constraints                                                                  |
| ----------------- | ----------- | ---------------------------------------------------------------------------- |
| id                | uuid        | PK                                                                           |
| company_id        | uuid        | NOT NULL                                                                     |
| location_id       | uuid        | NOT NULL                                                                     |
| printer_id        | uuid        | NOT NULL, FK → printer.id                                                    |
| kitchen_ticket_id | uuid        | NULLABLE, FK → kitchen_ticket.id                                             |
| content           | text        | NOT NULL                                                                     |
| status            | text        | NOT NULL, DEFAULT 'queued' CHECK IN ('queued','printing','printed','failed') |
| attempts          | integer     | DEFAULT 0                                                                    |
| printed_at        | timestamptz | NULLABLE                                                                     |
| created_at        | timestamptz | DEFAULT now()                                                                |

**Indexes**: `(company_id, location_id, printer_id, status)`, `(kitchen_ticket_id)`

## cashier_shift

| Campo         | Tipo          | Constraints                                                       |
| ------------- | ------------- | ----------------------------------------------------------------- |
| id            | uuid          | PK                                                                |
| company_id    | uuid          | NOT NULL                                                          |
| location_id   | uuid          | NOT NULL                                                          |
| user_id       | uuid          | NOT NULL, FK → user.id                                            |
| register_id   | uuid          | NULLABLE, FK → pos_register.id                                    |
| opened_at     | timestamptz   | NOT NULL, DEFAULT now()                                           |
| closed_at     | timestamptz   | NULLABLE                                                          |
| opening_float | numeric(12,2) | NOT NULL                                                          |
| expected_cash | numeric(12,2) | NULLABLE                                                          |
| actual_cash   | numeric(12,2) | NULLABLE                                                          |
| difference    | numeric(12,2) | GENERATED ALWAYS AS (actual_cash - expected_cash) STORED          |
| status        | text          | NOT NULL, DEFAULT 'open' CHECK IN ('open','closed','discrepancy') |
| notes         | text          | NULLABLE                                                          |

**Indexes**: `(company_id, location_id, user_id, status)`, `(opened_at)`

# Data Model: Print

**Status**: Pré-spec. Consolidado de `packs/restaurant/data-model.md`.

## printer

| Campo       | Tipo        | Constraints                                                          |
| ----------- | ----------- | -------------------------------------------------------------------- |
| id          | uuid        | PK                                                                   |
| company_id  | uuid        | NOT NULL                                                             |
| location_id | uuid        | NOT NULL                                                             |
| name        | text        | NOT NULL                                                             |
| driver      | text        | NOT NULL — escpos, star, epson, custom                               |
| connection  | jsonb       | NOT NULL — {type: 'network'/'usb'/'bluetooth', host, port, mac, ...} |
| station_ids | uuid[]      | NOT NULL — quais estações imprimem aqui                              |
| is_active   | boolean     | DEFAULT true                                                         |
| created_at  | timestamptz | DEFAULT now()                                                        |

## print_job

| Campo             | Tipo        | Constraints                                                    |
| ----------------- | ----------- | -------------------------------------------------------------- |
| id                | uuid        | PK                                                             |
| company_id        | uuid        | NOT NULL                                                       |
| location_id       | uuid        | NOT NULL                                                       |
| printer_id        | uuid        | NOT NULL, FK → printer.id                                      |
| kitchen_ticket_id | uuid        | NULLABLE, FK → kitchen_ticket.id                               |
| content           | text        | NOT NULL — ESC/POS bruto ou template renderizado               |
| status            | text        | NOT NULL, DEFAULT 'queued' — queued, printing, printed, failed |
| attempts          | integer     | DEFAULT 0                                                      |
| printed_at        | timestamptz | NULLABLE                                                       |
| created_at        | timestamptz | DEFAULT now()                                                  |

**Indexes**: `(company_id, location_id, printer_id, status)`, `(kitchen_ticket_id)`

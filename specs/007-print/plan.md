# Implementation Plan: Print (MVP)

**Status**: Pronto para implementar
**Base**: `specs/007-print/spec.md` (decisões fechadas)

---

## Project Structure

```
server/
├── api/v1/print/
│   ├── jobs.post.ts           # Enfileira job (idempotente)
│   ├── jobs/[id].get.ts       # Status do job
│   ├── jobs.get.ts            # Lista fila (query: status, printerId)
│   └── jobs/[id]/retry.post.ts # Reimpressão manual
├── tasks/
│   └── process-print-queue.ts # Worker cron (a cada 30s)
└── utils/print/
    ├── templates/
    │   ├── restaurant-kitchen-ticket.ts
    │   └── restaurant-table-comanda.ts
    ├── drivers/
    │   ├── escpos.ts          # Monta bytes ESC/POS text mode
    │   ├── tcp.ts             # Envia via net.Socket
    │   └── index.ts           # Factory por printer.driver
    └── queue.ts               # Helpers de status/retry
```

---

## Tasks (ordem de execução)

### Fase 1: Schema + Migration

- [ ] T001 Drizzle schema `printer` + `print_job` em `server/utils/schema/print.ts`
- [ ] T002 `drizzle-kit generate --name add-print-tables`
- [ ] T003 `drizzle-kit migrate` + validar RLS policies (location-scoped)

### Fase 2: Templates ESC/POS (puro TS, testável unitário)

- [ ] T004 `escpos.ts` — primitivas: `init()`, `text()`, `cut()`, `drawer()`, `feed()`, `encode()`
- [ ] T005 `restaurant-kitchen-ticket.ts` — input: `{orderItem, station, quantity}`, output: string ESC/POS
- [ ] T006 `restaurant-table-comanda.ts` — input: `{order, items, company, pixQR?}`, output: string ESC/POS
- [ ] T007 Testes unitários: snapshots dos bytes gerados (`.spec.ts`)

### Fase 3: Drivers de Transporte

- [ ] T008 `tcp.ts` — `send(host, port, bytes)` com timeout 5s + retry 1x
- [ ] T009 `usb.ts` / `serial.ts` — stub (opcional, só se houver hw)
- [ ] T010 `drivers/index.ts` — `getDriver(printer)` retorna `{send: (bytes) => Promise<void>}`

### Fase 4: API Endpoints

- [ ] T011 `jobs.post.ts` — valida `Idempotency-Key`, cria `print_job` com `content` (base64), retorna `{id, status: 'queued'}`
- [ ] T012 `jobs/[id].get.ts` — retorna job + status
- [ ] T013 `jobs.get.ts` — paginação cursor, filtros `status`, `printerId`
- [ ] T014 `jobs/[id]/retry.post.ts` — reseta `attempts=0`, `status=queued`

### Fase 5: Worker (Nitro Task)

- [ ] T015 `process-print-queue.ts` — cron `0 * * * * *` (a cada 30s)
  - Query: `print_job` where `status='queued' AND attempts < 3` order by `created_at`
  - Para cada: `status='printing'` → `driver.send(bytes)` → sucesso: `printed` + `printed_at`; falha: `attempts++`, `status='failed'` se >= 3
  - Log estruturado: `jobId`, `printerId`, `attempt`, `durationMs`, `error?`
- [ ] T016 Teste de integração: mock driver, validar transições de status

### Fase 6: Integração Restaurant Pack

- [ ] T017 Hook no `kitchen_ticket` creation → auto-enqueue `print_job` (station → printer via `station_ids`)
- [ ] T018 Hook no `order` status `completed` → enqueue `table-comanda` (opcional, behind feature flag)
- [ ] T019 Botão "Reimprimir" no frontend KDS/chama `retry.post`

### Fase 7: Observabilidade + Hardening

- [ ] T020 Métricas Prometheus: `print_jobs_queued`, `print_jobs_printed_total`, `print_jobs_failed_total`, `print_duration_seconds`
- [ ] T021 Alert: `print_jobs_failed_total > 10 in 5min` → ops
- [ ] T022 Documentar `print_job.content` schema (snapshot) em `data-model.md`

---

## Decisões Técnicas (já tomadas)

| Item                  | Decisão                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| ESC/POS library       | **Não usar lib** — `escpos.ts` próprio (50 linhas, text mode only, zero deps) |
| Queue persistence     | `print_job` table (já existe) — sem Redis/BullMQ                              |
| Cron scheduler        | Nitro tasks (built-in) — sem agenda.js                                        |
| Impressora descoberta | IP/porta fixo no cadastro (`printer.connection`) — sem mDNS/bonjour           |
| Idempotency           | Header `Idempotency-Key` (UUID v7) — `specs/000-foundation/idempotency.md`    |

---

## Estimativa (ponytail: 1 dev, sem blockers)

| Fase                     | Dias          |
| ------------------------ | ------------- |
| 1-2 (schema + templates) | 1             |
| 3 (drivers)              | 0.5           |
| 4 (API)                  | 1             |
| 5 (worker)               | 0.5           |
| 6 (integração)           | 1             |
| 7 (obs)                  | 0.5           |
| **Total**                | **~4.5 dias** |

---

## Riscos Conhecidos

- **Impressora offline** → job fica `failed` após 3 tentativas; UX: botão "Reimprimir" resolve
- **Encoding ESC/POS** — testar com modelo real (Epson TM-T20, Elgin i9) antes de merge
- **RLS** — validar que `print_job` respeita `location_id` do worker (worker roda como `merp_app`, seta GUCs via `withTenant`)

# Feature Specification: Print (Impressão Operacional — MVP)

**Status**: Spec fechada para MVP (2026-10)
**Dependências**: `006-core-order` (pedidos), `000-foundation/snapshot.md`
**Packs que consomem**: `packs/restaurant` (KDS, comanda)

---

## Objetivo (MVP)

Módulo de impressão **operacional only** — comanda de cozinha (KDS) e comanda de mesa.
**Fora do MVP**: NFC-e/SAT (fiscal), etiquetas, white-label templates.

---

## Decisões de Arquitetura (fechadas)

| Decisão               | Escolha                              | Justificativa                                                                       |
| --------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| **Tipo de documento** | Cupom operacional (não-fiscal)       | Atende restaurant pack agora; fiscal = fase 2 com certificado A1                    |
| **Formato**           | ESC/POS bruto (térmica 80mm)         | Universal, offline-native, corte/gaveta native                                      |
| **Render**            | Server-side (Nitro task)             | Gera bytes no worker, envia via TCP/USB/serial; custo zero infra                    |
| **Offline**           | Fila no servidor + retry exponencial | `print_job.status=queued` → worker tenta a cada 30s; botão "Reimprimir" no frontend |
| **Templates**         | Hardcoded por pack (`.ts` no repo)   | Restaurant = `restaurant-print-templates.ts`; mudança = deploy                      |

---

## Escopo MVP

### Tabelas (já em `data-model.md`)

- `printer` — driver `escpos`, connection `{type, host, port}`, `station_ids[]`
- `print_job` — `content` (ESC/POS bytes base64), `status: queued|printing|printed|failed`, `attempts`

### Endpoints (base `/api/v1/print`)

| Método | Rota                             | Descrição                                               |
| ------ | -------------------------------- | ------------------------------------------------------- |
| POST   | `/jobs`                          | Enfileira impressão (idempotente via `Idempotency-Key`) |
| GET    | `/jobs/:id`                      | Status do job                                           |
| GET    | `/jobs?status=queued&printerId=` | Fila por impressora                                     |
| POST   | `/jobs/:id/retry`                | Reimpressão manual                                      |

### Worker (Nitro task)

- `server/tasks/process-print-queue.ts` — roda a cada 30s (`0 * * * * *` cron)
- Pega jobs `queued` + `attempts < 3`, marca `printing`, envia bytes via `net.Socket` (TCP) ou `usb`/`serialport`
- Sucesso → `printed` + `printed_at`; Falha → `attempts++`, `failed` se >= 3

### Templates (hardcoded)

```
server/utils/print/templates/
├── restaurant-kitchen-ticket.ts  // KDS: item + estação + quantidade
└── restaurant-table-comanda.ts   // Mesa: header + itens + total + QR pix
```

Função pura: `(payload: PrintPayload) => string` (ESC/POS text mode, sem imagens).

---

## Fora de Escopo (explícito)

- NFC-e/DANFE/SAT (fiscal) — requer certificado A1, homologação, contingência offline complexa
- HTML/PDF/A4 — não necessário para térmica 80mm
- Template editor no admin / DB — white-label = fase 3
- Service Worker / IndexedDB no browser — fragilidade + Safari incompatível
- WebUSB/Bluetooth — suporte limitado, não funciona iOS

---

## Regras Herdadas

- RLS location-scoped (`company_id` + `location_id`) — `specs/000-foundation/rls-pattern.md`
- Índice `(company_id, location_id, created_at DESC)` — `specs/000-foundation/naming.md`
- Idempotency-Key obrigatório no POST — `specs/000-foundation/idempotency.md`
- Snapshot do payload no `print_job.content` — `specs/000-foundation/snapshot.md`

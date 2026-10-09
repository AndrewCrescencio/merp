# Parte 7: Print/Operational — Relatório de Revisão

## Escopo

- `server/api/print/` — Handlers: `POST /jobs` (enqueue), `POST /jobs/[id]/retry`, `POST /printers` (register)
- `server/utils/print/repository.ts` — `PrintRepository` (registerPrinter, getPrinters, getDefaultPrinter, enqueuePrintJob, getPendingJobs, markJobPrinting, completeJob, failJob, retryJob, cleanupOldJobs)
- `server/tasks/process-print-queue.ts` — Nitro task (cron `*/30 * * * *`)
- Schemas: `printer.ts`, `print-job.ts`
- Spec: `specs/consolidated-specs.md` seção 3 (Print MVP)

---

## Veredito

| Critério             | Status | Justificativa                                                                                                                                                                                                                                                                 |
| -------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1 — Bugs/Falhas** | ❌     | **CRÍTICO**: Mesmo bug `event.context.auth` — **todos print handlers falham 401**; `sendToPrinter` é stub (não implementa TCP/USB/serial); Templates ESC/POS referenciados no spec **não existem**; Task cron 30min vs spec 30s; Faltam endpoints GET job status / list queue |
| **R2 — Segurança**   | ⚠️     | RLS backstop via `withTenant` mas **location-scoped RLS ausente** (P02-A01); `connectionConfig` armazenado como text (JSON string) — validação/parsing não verificado; Task roda como sistema (acessa todos tenants) — sem auditoria per-tenant                               |

---

## Achados

### P07-A01 — CRÍTICO: Handlers print usam `event.context.auth` inexistente (mesmo bug P05-A01/P06-A01)

- **Tipo**: Bug (quebra total)
- **Severidade**: **Crítica**
- **Confiança**: Alta
- **Arquivo**: `server/api/print/jobs.post.ts:6`, `server/api/print/printers.post.ts:6`, `server/api/print/jobs/[id]/retry.post.ts:5`
- **Evidência**: Todos fazem `const auth = event.context.auth` e `const { companyId, locationId } = auth.session`. Middleware seta `event.context.session` (com `activeCompanyId`) mas **não `locationId`**. Session schema não tem `locationId`.
- **Impacto**: **Todos endpoints print (enqueue job, register printer, retry job) retornam 401 ou crash** — funcionalidade totalmente quebrada.
- **Correção**: Mesmo fix dos outros módulos — usar `event.context.session` + `event.context.user` ou adicionar `auth` no middleware.

### P07-A02 — `sendToPrinter` é stub (não implementa impressão real)

- **Tipo**: Bug (funcionalidade ausente)
- **Severidade**: Alta
- **Confiança**: Alta
- **Arquivo**: `server/tasks/process-print-queue.ts:72-81`
- **Evidência**: `sendToPrinter` faz `console.log` + `setTimeout(100)` + `Math.random() < 0.01` throw. **Não usa `net.Socket` (TCP), `usb`, ou `serialport`**. Spec linha 181: "envia bytes via `net.Socket` (TCP) ou `usb`/`serialport`".
- **Impacto**: Print queue worker não imprime nada real. Jobs ficam `printing` → `completed` (mock) ou `failed` (1% aleatório).
- **Correção**: Implementar drivers:
  - `network` (TCP/RAW port 9100): `net.createConnection({ host, port })` → `socket.write(Buffer.from(content, 'base64'))`
  - `usb`: `usb-detection` + `usb` npm packages
  - `bluetooth`: `bluetooth-serial-port` ou similar
  - Parse `connectionConfig` JSON (ex.: `{ "host": "192.168.1.100", "port": 9100 }`)

### P07-A03 — Templates ESC/POS referenciados no spec **não existem** no repo

- **Tipo**: Bug (funcionalidade ausente)
- **Severidade**: Alta
- **Confiança**: Alta
- **Arquivo**: `specs/consolidated-specs.md:186-188`, `server/utils/print/` (sem pasta `templates/`)
- **Evidência**: Spec linhas 186-188: `restaurant-kitchen-ticket.ts` (KDS) + `restaurant-table-comanda.ts` (mesa + QR PIX). Repo não tem `server/utils/print/templates/`. Handler `jobs.post.ts` valida `template: 'receipt' | 'kitchen-ticket'` mas repository `enqueuePrintJob` só guarda `payload` — **não gera ESC/POS bytes**.
- **Impacto**: Print job enfileirado com `payload` cru (JSON) — worker não sabe formatar. Spec diz "Templates hardcoded por pack (.ts no repo)".
- **Correção**:
  1. Criar `server/utils/print/templates/restaurant-kitchen-ticket.ts` → gera ESC/POS para cozinha (item + estação + qtd)
  2. Criar `server/utils/print/templates/restaurant-table-comanda.ts` → gera ESC/POS para mesa (header + itens + total + QR PIX)
  3. `enqueuePrintJob` deve chamar template → gerar `content` (base64 ESC/POS) → salvar no `printJob.content`

### P07-A04 — Task cron `*/30 * * * *` (30 min) vs spec 30 segundos

- **Tipo**: Bug (config)
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `server/tasks/process-print-queue.ts:8` (comentário), `package.json`/`nitro.config.ts` (não vi cron config real)
- **Evidência**: Comentário linha 8: "runs every 30 minutes". Spec linha 180: "roda a cada 30s (`0 * * * * *` cron)". Nitro tasks usam cron syntax padrão (5 campos) — `*/30 * * * *` = 30 min. Para 30s precisa external scheduler ou loop interno.
- **Impacto**: Jobs ficam até 30 min na fila antes de tentar imprimir. Spec exige retry a cada 30s.
- **Correção**:
  - Opção A: Nitro task com `setInterval` interno (roda a cada 30s dentro do processo)
  - Opção B: External cron (systemd timer, Kubernetes CronJob) chamando endpoint interno
  - Opção C: Nitro `cron: '*/30 * * * * *'` (6 campos = segundos) — verificar se Nitro suporta

### P07-A05 — Faltam endpoints GET `/jobs/:id` e GET `/jobs?status=queued`

- **Tipo**: Bug (API incompleta)
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `specs/consolidated-specs.md:174-176`, `server/api/print/`
- **Evidência**: Spec define 4 endpoints. Repo tem: `POST /jobs`, `POST /jobs/:id/retry`, `POST /printers`. **Faltam**: `GET /jobs/:id` (status), `GET /jobs?status=queued&printerId=` (fila).
- **Impacto**: Frontend não pode consultar status de job nem mostrar fila por impressora.
- **Correção**: Adicionar handlers `jobs/[id].get.ts` e `jobs.get.ts` (com query params).

### P07-A06 — `connectionConfig` armazenado como `text` (JSON string) — parsing/validação?

- **Tipo**: Bug / Segurança
- **Severidade**: Média
- **Confiança**: Média
- **Arquivo**: `server/utils/schema/printer.ts:20`, `server/api/print/printers.post.ts:34-35`
- **Evidência**: Schema: `connection: jsonb('connection').notNull()` — migration 0015 usa `connection_config text NOT NULL`. Handler recebe `connectionConfig` string, passa direto para repository → salva como text. Worker precisa `JSON.parse` → erro se malformado.
- **Impacto**: Config inválida salva → worker crash ao parsear. Injection risk se não validado.
- **Correção**:
  1. Schema TS: `connectionConfig: jsonb('connection_config').notNull()` (match migration)
  2. Handler: validar `JSON.parse(connectionConfig)` + schema por `connectionType` (network: host+port, usb: vendorId+productId, bluetooth: macAddress)
  3. Worker: try/catch no parse + log erro estruturado

### P07-A07 — Task `process-print-queue` roda como sistema (acessa todos tenants) — sem auditoria per-tenant

- **Tipo**: Segurança / Auditoria
- **Severidade**: Baixa
- **Confiança**: Média
- **Arquivo**: `server/tasks/process-print-queue.ts:17-40`
- **Evidência**: Task usa `db` (owner role? não, `db` usa `APP_DATABASE_URL` = `merp_app` role). Itera `db.query.company.findMany()` → para cada company, itera locations → `printRepository.getPendingJobs` (usa `withTenant`). **Porém**: task não emite `auth_event` para jobs processados. Logs só `console.log`.
- **Impacto**: Impressões não auditadas (quantidade, sucesso/falha, printer). LGPD/Compliance: processamento de dados (pedidos, PII no payload) sem log.
- **Correção**: Emitir `auth_event` (ou `print_event` table) com `companyId`, `jobId`, `printerId`, `status`, `timestamp` no `completeJob`/`failJob`.

### P07-A08 — `printJob.payload` é `jsonb` mas spec diz `content` (ESC/POS bytes base64)

- **Tipo**: Bug (schema vs spec)
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `specs/consolidated-specs.md:171` (`content` ESC/POS bytes base64), `server/utils/schema/print-job.ts:26` (`content: text('content').notNull()`), `server/utils/print/repository.ts:111` (`payload: input.payload`)
- **Evidência**: Spec: `print_job.content` = ESC/POS bytes base64. Schema: `content` (text) + `payload` (jsonb — não existe no schema TS!). Migration 0015: `payload jsonb NOT NULL` + `content` não existe. Repository insere `payload` mas não `content`.
- **Impacto**: Schema/migration/TS inconsistentes. Worker espera `content` (bytes) mas salva `payload` (JSON). Template rendering não implementado.
- **Correção**: Alinhar: migration adicionar `content text`, remover `payload` ou manter ambos (payload = input JSON, content = rendered ESC/POS). Repository gerar `content` via template antes de insert.

---

## Pontos Fortes

- **Repository completo**: CRUD + queue ops (enqueue, pending, mark printing, complete, fail, retry, cleanup)
- **Default printer logic**: `getDefaultPrinter` por type (receipt/kitchen) + `isDefault` + `status='online'`
- **Priority queue**: `getPendingJobs` ordena por `priority DESC, createdAt ASC`
- **Retry logic**: `retryJob` reseta `attempts=0`, `status=pending`, `lastError=null`
- **Cleanup job**: `cleanupOldJobs` remove completed/failed > 30 dias
- **`withTenant` em todas queries**: RLS backstop (company + location)

---

## Sinais para Roadmap

- **P0 (bloqueador)**: Fix `event.context.auth` bug (P07-A01) — **quebra todos endpoints print**
- **P0 (bloqueador)**: Implementar `sendToPrinter` real (TCP/USB/serial) — **core functionality**
- **P0 (bloqueador)**: Criar templates ESC/POS (`restaurant-kitchen-ticket.ts`, `restaurant-table-comanda.ts`) — **spec requirement**
- **P0 (bloqueador)**: Alinhar schema `print_job` (content vs payload) + migration
- **P1**: Fix task cron para 30s (ou loop interno)
- **P1**: Adicionar endpoints GET job status / list queue
- **P1**: Validar `connectionConfig` JSON por connectionType
- **P2**: Auditoria de print jobs (print_event table)
- **P2**: Printer status monitoring (last_seen_at, heartbeat)

---

## Não Verificado / Dúvidas

- Nitro task cron syntax real (não vi config em `nitro.config.ts` — `experimental: { tasks: true }` apenas)
- `usb`/`serialport`/`bluetooth-serial-port` dependencies não estão no `package.json`
- QR PIX generation para comanda (spec menciona) — lib não identificada
- Print job idempotency key (spec diz obrigatório) — handler não valida header

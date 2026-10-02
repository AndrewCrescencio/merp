# Print API Contracts

**Status**: Pré-spec. Endpoints a definir.

Base path sugerido: `/api/v1/print` (ADR-005).

## Endpoints preliminares (rascunho — não implementar ainda)

- `POST /api/v1/print/jobs` — enfileira impressão (idempotente)
- `GET /api/v1/print/jobs/:id` — status
- `GET /api/v1/print/jobs?status=queued` — fila por printer
- `POST /api/v1/print/jobs/:id/retry` — reimpressão

Regras herdadas: `000-foundation/{endpoint-pattern,idempotency,money}.md`.

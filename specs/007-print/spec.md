# Feature Specification: Print (Impressão Operacional)

**Status**: Scaffold criado (2026-10) — conteúdo a preencher.
**Dependências**: `006-core-order` (para imprimir pedidos), `000-foundation/snapshot.md`
**Packs que consomem**: `packs/restaurant` (KDS, comanda), `packs/erp-b2b` (futuro)

## Objetivo

[PREENCHER] Módulo unificado de impressão — cupom de pedido, comanda de
cozinha (KDS), futuro fiscal (NFC-e/DANFE). Deve funcionar offline (PDV).

## Perguntas em aberto (resolver antes de `plan.md`)

1. **Tipo de documento**: cupom operacional? fiscal? etiqueta? os três?
2. **Formato**: PDF server-side, HTML→print do browser, ESC/POS térmico?
3. **Onde renderiza**: cliente (Nuxt print dialog) ou servidor (Nitro → arquivo)?
4. **Offline**: precisa funcionar sem internet? (ver
   `000-foundation/fiscal-br.md` §Contingência Offline)
5. **Modelos/templates**: um por pack? configurável por company?

## Escopo preliminar (consolidado dos fragmentos existentes)

- Tabelas `printer` e `print_job` (ver `packs/restaurant/data-model.md`)
- RLS location-scoped (ver `ADR-002`, `000-foundation/rls-pattern.md`)
- Índice `(company_id, location_id, created_at DESC)` (ver `000-foundation/naming.md`)
- `print_job.status`: `queued | printing | printed | failed`
- Snapshot do payload no job (ver `000-foundation/snapshot.md`)

## Fora de escopo (deferido)

- Fiscal (NFC-e/DANFE) — ver `000-foundation/fiscal-br.md`
- KDS realtime — ver `packs/restaurant/spec.md`

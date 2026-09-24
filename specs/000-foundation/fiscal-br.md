# specs/000-foundation/fiscal-br.md

## Escopos Futuros

| Documento | Descrição                                                 | Status    |
| --------- | --------------------------------------------------------- | --------- |
| NFC-e     | Nota Fiscal de Consumidor Eletrônica (varejo/restaurante) | Planejado |
| SAT       | Sistema Autenticador e Transmissor de Cupons Fiscais (SP) | Planejado |
| NF-e      | Nota Fiscal Eletrônica (B2B/wholesale)                    | Planejado |

## Contingência Offline

**Requisito de PDV**: venda sem internet.

- Cache local de autorização (número de série, QR Code offline)
- Sincronização assíncrona quando conectividade retorna
- `print_job` com status `queued` → `printed` mesmo offline
- Ver `specs/packs/restaurant/contracts/restaurant-api.md` (turno de caixa)

## Retenção Fiscal Própria

Documento fiscal tem retenção de **5 anos** (Art. 173 CTN + legislação estadual).

- Cruzar com `specs/000-foundation/snapshot.md` (order_item congela tax_snapshot)
- Cruzar com `specs/001-auth-context/spec.md` §Data Governance (PII, auth_event 90d vs fiscal 5y)
- Tabelas fiscais (futuras): `fiscal_document`, `fiscal_document_item`, `fiscal_event` — retenção 5y, RLS por company+location

## Referência

Spec detalhada virá quando o núcleo (`specs/006-core-order/`) fechar.
Dependências: `party` (customer/supplier), `catalog` (product com NCM/CEST/CFOP), `inventory` (stock_movement para CIAP), `finance` (contas a pagar/receber para escrituração).

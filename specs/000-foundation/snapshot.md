# specs/000-foundation/snapshot.md

## Regra

Todo `order_item` **congela** no momento da criação:

| Campo              | Origem                        | Motivo                                 |
| ------------------ | ----------------------------- | -------------------------------------- |
| `product_name`     | `product.name`                | Editar produto não reescreve o passado |
| `unit_price`       | `price_list` vigente          | Histórico de preço fiel                |
| `tax_snapshot`     | `tax_rule` vigente            | Alíquota na data do pedido             |
| `bom_snapshot`     | `product.bom` (ficha técnica) | Composição no momento da venda         |
| `discount_applied` | Regra de desconto vigente     | Auditoria de margem                    |

## Motivação

- Editar produto/preço/imposto **não** reescreve pedidos passados.
- Fiscal: documento emitido reflete snapshot, não estado atual.
- Cruzar com `specs/000-foundation/money.md` (arredondamento por linha) e `specs/001-auth-context/spec.md` §Data Governance (retenção 5 anos).

## Aplicação

Vale para:

- `order_item` (núcleo)
- `fiscal_document_item` (futuro)
- Qualquer linha de movimento que gere documento fiscal

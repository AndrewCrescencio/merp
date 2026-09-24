# specs/000-foundation/naming.md

## Convenções

- **Tabela**: singular (`company`, `order`, `order_item`)
- **Coluna**: `snake_case`
- **JSON/JSONB**: `camelCase` nas chaves
- **PK**: `uuid` (nunca `text`)
- **UNIQUE de negócio**: sempre `(company_id, campo)` — ex.: `(company_id, slug)`

## Índice Padrão

Tabelas de movimento (`order`, `order_item`, `stock_movement`, `cash_shift`, `kitchen_ticket`, `print_job`):

```sql
CREATE INDEX idx_{tabela}_tenant_time ON {tabela} (company_id, location_id, created_at DESC);
```

## Glossário

| Termo          | Significado                                                        |
| -------------- | ------------------------------------------------------------------ |
| `tenant`       | = `company` (não confundir com plugin organization do Better Auth) |
| `organization` | **não usado** — plugin do Better Auth desabilitado                 |
| `location`     | Unidade física (loja, restaurante, filial)                         |

## Mapeamento Explícito

| Sessão (Better Auth)       | Banco (snake_case)           |
| -------------------------- | ---------------------------- |
| `session.activeCompanyId`  | `session.active_company_id`  |
| `session.activeLocationId` | `session.active_location_id` |

Toda conversão camelCase ↔ snake_case na boundary (handler ↔ repo).

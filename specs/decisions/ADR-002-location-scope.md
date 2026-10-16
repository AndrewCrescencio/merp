# ADR-002: Escopo de RLS — Company + Location

## Contexto

Multi-tenant hoje é só `company_id`. Restaurante com 5 unidades precisa que gerente da unidade A não veja a B. ERP B2B com filiais tem a mesma necessidade. Adicionar depois, com dados populados, é migração dolorosa.

## Decisão

Toda tabela **OPERACIONAL** carrega `company_id NOT NULL` E `location_id NOT NULL`. Toda tabela de **IDENTIDADE** só `company_id NOT NULL`.

### Classificação

| Tipo                                   | Tabelas                                                                  | Colunas RLS                        |
| -------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| company-only                           | company, company_member, invite, user, catalog, party                    | company_id                         |
| company + location obrigatório         | order, order_item, stock_movement, cash_shift, kitchen_ticket, print_job | company_id, location_id            |
| company + location opcional (nullable) | customer, supplier, price_list                                           | company_id, location_id (nullable) |

### Policy template normativo

```sql
-- company-only
USING (company_id = get_tenant_id())

-- company+location
USING (company_id = get_tenant_id()
AND (location_id = get_location_id()
OR get_location_id() IS NULL))
```

### GUC novo

`app.location_id` (além de `app.tenant_id` e `app.user_id` existentes).

### Assinatura normativa

```typescript
withTenant(companyId, locationId, userId, fn, existingTx?)
```

## Consequências

- Migrar call sites existentes passando `null` para `location`.
- Testes de RLS ganham dimensão `location`.
- Índice `(company_id, location_id, created_at DESC)` em tabelas de movimento.
- `company_member` ganha `default_location_id` (nullable).
  **Implementado em 2026-10-16** (migração `0028`, `resolveLocationId` em
  `server/utils/shared/location.ts`): fecha o H07 — os handlers de
  restaurant/print/order forjavam a fonte com `''`, o que funcionava no GUC
  (vira NULL → escopo company) mas quebrava nos `eq(col, locationId)` do
  repositório, que enxergavam um valor concreto. `NULL` continua sendo estado
  legítimo: significa "sem location no escopo" e cai no escopo company.

## Alternativas rejeitadas

| Alternativa                    | Motivo                                         |
| ------------------------------ | ---------------------------------------------- |
| `location_id` nullable em tudo | Falha-closed: `NULL` vaza dados cross-location |
| Schema por tenant              | Complexidade operacional, não escala           |
| `location_id` como array       | Query complexa, índice ineficiente             |

## Perguntas abertas

- Transferência de estoque entre locations (origem + destino numa linha ou dois movimentos)?
- `auth_event` precisa de `location`?

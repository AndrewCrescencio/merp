# ADR-002: Escopo de RLS — Company + Location

## Contexto

Multi-tenant hoje é só `company_id`. Restaurante com 5 unidades precisa que gerente da unidade A não veja a B. ERP B2B com filiais tem a mesma necessidade. Adicionar depois, com dados populados, é migração dolorosa.

## Decisão

Toda tabela **OPERACIONAL** carrega `company_id NOT NULL` E `location_id NOT NULL`. Toda tabela de **IDENTIDADE** só `company_id NOT NULL`.

### Classificação

> **Corrigido em 2026-10-16** contra o schema real. A tabela anterior estava
> materialmente errada: listava `party` como company-only (ele é
> `location_id NOT NULL` **e** tem policy location-scoped na `0024`), citava
> `cash_shift`/`stock_movement`/`catalog`/`customer`/`supplier`/`price_list`,
> que não existem, e omitia 8 tabelas reais. A DECISÃO abaixo não mudou — o
> inventário é que estava errado.

| Tipo                        | Tabelas                                                                                                                          | Colunas RLS                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| company-only                | company, company_member, invite, user, session, account, verification, auth_event, auth_security_state                           | company_id                            |
| é uma loja (auto-referente) | location                                                                                                                         | company_id + `id = get_location_id()` |
| company + location NOT NULL | order, order_item, party, payment, cashier_shift, kitchen_station, kitchen_ticket, restaurant_table, product, printer, print_job | company_id, location_id               |

`order_dine_in` e `order_takeout` são **subtipos** de `order` ligados por FK:
herdam o escopo pelo JOIN, então não duplicam `location_id`. Têm policy própria
em `0024` (company-only).

### Policy template normativo

```sql
-- company-only
USING (company_id = get_tenant_id())

-- company+location
USING (company_id = get_tenant_id()
AND (location_id = get_location_id()
OR get_location_id() IS NULL))

-- location (não tem location_id: filtra pelo próprio id)
USING (company_id = get_tenant_id()
AND (id = get_location_id()
OR get_location_id() IS NULL))
```

O escape `OR get_location_id() IS NULL` **não é fail-open**: ele só dispensa o
filtro de location quando não há uma no escopo; o tenant continua obrigatório.
É o estado correto para quem opera sem loja atribuída (dono/admin).

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

### Origem do `location_id`: derivada do servidor

O location **não vem do path nem do body** — vem de
`company_member.default_location_id`, lido por `resolveLocationId` e injetado
na GUC pelo `withTenant`. O cliente nunca envia location, portanto não tem como
pedir loja alheia.

Colocar no path (`/companies/{cid}/locations/{lid}/...`) foi rejeitado: obriga
uma validação extra de membership-por-location para impedir que o cliente
escolha a loja errada, e duplica a fonte de escopo. Diferente do
`activeCompanyId` (derrubado pelo R5), aqui não há competição de fontes:
`default_location_id` é a única.

Atribuição é **owner-only** —
`PATCH /api/v1/companies/{companyId}/members/{userId}/default-location`
(`setMemberDefaultLocation`), que valida que a location pertence à mesma
empresa e está ativa. Quem decide em qual loja o staff trabalha é a empresa.

## Alternativas rejeitadas

| Alternativa                    | Motivo                                         |
| ------------------------------ | ---------------------------------------------- |
| `location_id` nullable em tudo | Falha-closed: `NULL` vaza dados cross-location |
| Schema por tenant              | Complexidade operacional, não escala           |
| `location_id` como array       | Query complexa, índice ineficiente             |

## Desvios em relação a esta decisão

Registrados porque contrariam a regra acima. Corrigir exige migração.

| Tabela    | Desvio                                                                                                                                                                                                                                                                                                             | Situação                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payment` | Descrevida aqui como "tabela operacional sem RLS" — a causa real era outra: `server/utils/schema/payment.ts` **nunca foi exportada do `schema/index.ts`**, então o `drizzle-kit push` nunca criou a tabela em nenhum banco. Sem tabela não havia grants nem policy a aplicar; o `information_schema` nem a listava | **Resolvido removendo o aparato** (2026-10-17). O spec define pagamento como "NFC-e (fase posterior)" e nada a importava. Ao iniciar essa fase, criar a tabela **com as 4 policies location-scoped no mesmo commit** — nunca depois |
| `session` | Carrega `active_company_id`, que não é location e não participa do escopo                                                                                                                                                                                                                                          | Legado morto — ver `specs/000-foundation/rest-api.md`                                                                                                                                                                               |

## Perguntas abertas

- Transferência de estoque entre locations (origem + destino numa linha ou dois movimentos)?
- `auth_event` precisa de `location`?

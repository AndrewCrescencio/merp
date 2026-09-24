# specs/000-foundation/rls-pattern.md

## Template de Policy por Tipo

| Tipo            | USING                                                                                             | WITH CHECK                                                         |
| --------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| tenant-scoped   | `company_id = get_tenant_id()`                                                                    | `company_id = get_tenant_id()`                                     |
| location-scoped | `company_id = get_tenant_id() AND (location_id = get_location_id() OR get_location_id() IS NULL)` | `company_id = get_tenant_id() AND location_id = get_location_id()` |
| global          | (sem RLS / role dedicada)                                                                         | (sem RLS / role dedicada)                                          |
| user-scoped     | `user_id = get_user_id()`                                                                         | `user_id = get_user_id()`                                          |

## Matriz Tabela × Operação × Role

| Tabela         | SELECT       | INSERT       | UPDATE       | DELETE | Role         |
| -------------- | ------------ | ------------ | ------------ | ------ | ------------ |
| company        | own          | owner        | owner        | owner  | owner        |
| company_member | own+member   | owner        | owner        | owner  | owner/member |
| order          | own+location | own+location | own+location | owner  | owner/member |
| order_item     | own+location | own+location | own+location | owner  | owner/member |
| stock_movement | own+location | own+location | —            | —      | owner/member |
| catalog        | own          | owner        | owner        | owner  | owner        |
| party          | own          | own          | own          | own    | owner/member |

_own = tenant atual; location = location atual (ou null = superadmin)_

## Assinatura `withTenant`

```typescript
function withTenant<T>(
  companyId: string,
  locationId: string | null,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
  existingTx?: Tx,
): Promise<T>
```

Único caminho para queries com RLS. Seta GUCs `app.tenant_id`, `app.location_id`, `app.user_id` na transação.

## GUCs Oficiais

- `app.tenant_id` (company_id)
- `app.location_id` (location_id, nullable)
- `app.user_id` (user_id)

## Fail-Closed

GUC ausente → `NULLIF` → `NULL` → 0 rows → API 404 genérico. Nunca vaza dado.

## Proibições

- `SECURITY DEFINER` functions
- `BYPASSRLS` role (exceto `merp` owner para migrações)
- `SET` session-level GUCs fora de `withTenant`
- Views sem `SECURITY INVOKER` — salvo ADR de segurança

## Cross-Tenant Legítimo

Relatórios agregados, suporte: role dedicada + policy própria + audit log obrigatório.

## ALTER DEFAULT PRIVILEGES

Regra (referenciar migration 0020). Grants automáticos para `merp_app` em novas tabelas.

## Proibido: UPDATE com USING ≠ WITH CHECK

Sem ADR justificando. Default: USING = WITH CHECK.

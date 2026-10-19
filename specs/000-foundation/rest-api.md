# REST API — Requisitos de Rotas (R1–R8)

Contrato de desenho das rotas HTTP do Merp, estabelecido na migração para
`/api/v1` (ADR-005). As partes mecânicas são **impostas por guarda** no CI:
`scripts/check-routes.ts` (estrutura/naming/tenant/param) e
`server/utils/stale-api-urls.spec.ts` (nenhum path antigo no backend).

## Requisitos

| #   | Requisito                                                                                                                                                                                                                          | Imposição                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| R1  | Prefixo `/api/v1/...`; segmentos kebab-case; substantivos no plural; **id no path, nunca no body** (idem `companyId` — vem do path).                                                                                               | `check-routes` (kebab + tenant)                                           |
| R2  | Uma pasta por recurso: coleção `index.<get\|post>.ts`; item `[<recurso>Id]/index.<get\|patch\|delete>.ts`; ação `[<recurso>Id]/<verbo>.post.ts`. Params **`[orderId]`, nunca `[id]`**; a chave de `getRouterParam` casa com o dir. | `check-routes` (filename, param, param-key)                               |
| R3  | GET sem efeito colateral (só leitura); POST cria/transição; PATCH atualização parcial; DELETE sem body (soft delete fiscal).                                                                                                       | convenção + specs de handler                                              |
| R4  | Transição de estado = `POST {recurso}/{id}/{verbo}` (ex.: `/cancel`, `/complete`); **sem `PATCH /status`** genérico.                                                                                                               | `status.patch` deletado; specs                                            |
| R5  | Tenant no path `/api/v1/companies/{companyId}/...`; middleware único **fail-closed**; `companyId` extraído do path (regex); handler **nunca** lê `companyId` de body.                                                              | `check-routes` (tenant) + `server/middleware/tenant.ts` (`requireTenant`) |
| R6  | Tokens (reset/verify/convite) **nunca em path/query** — só no body; o email aponta para páginas Nuxt que chamam `POST` com o token no body.                                                                                        | validators body-only; rota `reset-password/[token]` deletada              |
| R7  | Filtros/paginação de query em camelCase (`?limit=&cursor=&status=`).                                                                                                                                                               | validação Zod por handler                                                 |
| R8  | 201 + `Location` na criação; DELETE 204; async 202; transição inválida 409; inexistente **ou de outra empresa** 404; sem papel 403.                                                                                                | ver status abaixo                                                         |

## Status de implementação (verificado em runtime em 2026-10-19)

R1–R7 implementados e impostos por `check-routes` + `stale-api-urls.spec`.
**R8 completo**:

- ✅ criação → **201 + `Location`**: `register` (`/api/v1/me`), `companies`,
  `orders`, `invitations`, `print/printers`, `print/jobs`,
  `restaurant/cashier-shifts` — `Location` = `/api/v1/.../{id}` do criado
- ✅ DELETE → **204 sem corpo** (`sendNoContent`)
- ✅ transição inválida → **409** (`{ error: 'conflict' }`) — ex.: cancel/complete
  de pedido, mesa ocupada/livre, turno aberto/já fechado, convite duplicado
- ✅ inexistente ou de outra empresa → **404** (`{ error: 'not_found' }`) —
  membership ausente no middleware tenant e ramos `not found` dos handlers
- ✅ sem papel → **403** (`{ error: 'forbidden' }`, `assertCompanyRole`)
- ✅ **202: sem alvo** — nenhum endpoint é assíncrono (o `background()` dispara
  e-mail em fluxos síncronos); se um async surgir, responder 202

Os 4xx do contrato saem pelos helpers `send*Error`
(`server/utils/shared/errors.ts`). `createError` cru com status < 500 não é
JSON de contrato e o error-handler (FR-026) o normaliza como `internal_error`;
os handlers usam helpers em todo ramo alcançável (restam só guards defensivos
inalcançáveis: 401 pós-auth-middleware e `*_id_required` com param garantido
pelo router).

Verificação em runtime (2026-10-19, dev server + banco real):

- **R3**: sweep de 10 GETs com contagens de 9 tabelas de negócio idênticas
  antes/depois; nenhum `*.get.ts` escreve (varredura estática)
- **R4**: não existe rota `PATCH .../status` (o path nem chega à API); transições
  só como `POST {recurso}/{id}/{verbo}`
- **R8**: todos os códigos acima exercitados de ponta a ponta (inclusive
  DELETE 204 com 0 bytes e 404 cross-tenant nos dois sentidos); ramos 409/404
  cobertos por specs de handler (`transitions.spec.ts`)

## Relação com ADR-005

- **Item 1** (novos endpoints em `/api/v1`): ✓ — `companies`, `orders`, `print`,
  `restaurant`, `me` sob `/api/v1`.
- **Item 2** (auth permanece em `/api/auth/*` até v2): ✓ para os **fluxos** de
  auth — `login`, `logout`, `register`, `password/*`, `email/*` seguem em `/api/auth`.
- Escopo do item 2 estreitado: os endpoints que viviam **erratamente** sob
  `/api/auth` mas **não são fluxo de auth** (`/me`, `/companies`, `/invites`,
  `/deactivate`, `/export`, `/consent`) migraram para `/api/v1` conforme R1/R5.
- `POST /api/auth/companies/switch` foi **removido** — nenhum endpoint escreve
  `activeCompanyId`; em R5 o `companyId` vem sempre do path.
  **Código morto removido em 2026-10-16**: `setActiveCompany`,
  `getActiveCompany`, o campo no response de `GET /api/v1/me`, os fallbacks de
  audit `tenantId` e os tipos associados. **A coluna
  `session.active_company_id` permanece no schema** como legado morto — nenhum
  caminho a lê nem a escreve. Removê-la exige migração (`drizzle/`,
  `server/utils/schema/**`, `server/middleware/auth*.ts`, todos protegidos).

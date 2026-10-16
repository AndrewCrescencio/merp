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

## Status de implementação

R1–R7 implementados e impostos. **R8 está parcial** (a migração moveu as rotas
sem mudar as respostas — contrato, não regra de negócio):

- ✅ inexistente / de outra empresa → **404** (`middleware/tenant.ts` — membership
  inexistente responde 404 sem vazar existência)
- ✅ sem papel → **403** (`assertCompanyRole`)
- ✅ criação → **201** (`register`, `companies`, `invitations`) — porém **sem header `Location`**
- ❌ DELETE → hoje **200 + JSON**, não 204
- ❌ transição inválida → hoje **400**, não 409 (ex.: `cancel`)
- ❌ async → nenhum endpoint devolve 202

> Itens ❌ são pendências de contrato que precisam de decisão/ implementação
> explícita; estão registrados aqui para não virarem divergência silenciosa.

## Relação com ADR-005

- **Item 1** (novos endpoints em `/api/v1`): ✓ — `companies`, `orders`, `print`,
  `restaurant`, `me` sob `/api/v1`.
- **Item 2** (auth permanece em `/api/auth/*` até v2): ✓ para os **fluxos** de
  auth — `login`, `logout`, `register`, `password/*`, `email/*` seguem em `/api/auth`.
- Escopo do item 2 estreitado: os endpoints que viviam **erratamente** sob
  `/api/auth` mas **não são fluxo de auth** (`/me`, `/companies`, `/invites`,
  `/deactivate`, `/export`, `/consent`) migraram para `/api/v1` conforme R1/R5.
- `POST /api/auth/companies/switch` foi **removido** — nenhum endpoint escreve
  `activeCompanyId`; em R5 o `companyId` vem sempre do path. **O campo não foi
  removido**: a coluna, as ~21 leituras (audit `tenantId` de
  `session_created`/`logout`/`deactivate`, e o `activeCompanyId` devolvido por
  `GET /api/v1/me`) e `setActiveCompany` seguem de pé, mas `setActiveCompany`
  não tem chamador de produção. Resultado prático: o valor é sempre `null`
  para sessão nova. Completar a remoção exige ADR — toca `drizzle/`,
  `server/utils/schema/**`, `server/utils/auth/**` e
  `server/middleware/auth*.ts`, todos protegidos.

## Divergência de docs conhecida

`specs/001-auth-context/contracts/auth-api.md` ainda documenta o contrato
**antigo**: paths movidos para `/api/v1`, `POST /companies/switch` deletado,
`GET /reset-password/[token]` deletado, `GET /api/health` dividido em
`live`/`ready`, `GET /api/metrics` removido, e tokens agora só no body.
Refresh desse arquivo é trabalho separado.

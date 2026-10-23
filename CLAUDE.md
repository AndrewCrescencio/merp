# CLAUDE.md — MERP

Regras para agentes trabalhando neste repo. Código > docs.

## Princípios

1. **Vertical Slices**: `server/utils/<contexto>/` — autônomos, sem imports cruzados (ESLint bloqueia)
2. **Handler → Repository → Drizzle** — Sem Service layer
3. **RLS Fail-Closed**: `withTenant(tenantId, locationId, userId, fn)` obrigatório; `merp_app` NOBYPASSRLS
4. **YAGNI**: stdlib primeiro, deletar > adicionar, uma fonte por fato

## Comandos

| Ação                   | Comando                                   |
| ---------------------- | ----------------------------------------- |
| Check pré-commit       | `npm run check`                           |
| Dev server             | `npm run dev`                             |
| Testes                 | `npm test` / `DB_AVAILABLE=true npm test` |
| Lint                   | `npm run lint`                            |
| Typecheck              | `npm run typecheck`                       |
| Migrações (banco novo) | `npm run db:migrate:full`                 |
| Nova migração          | `npx drizzle-kit generate --name <nome>`  |

## Padrão Endpoint

Rota de empresa: `/api/v1/companies/{companyId}/...` — `companyId` vem do **path** (middleware tenant), nunca do body.

```ts
// server/api/v1/companies/[companyId]/<recurso>/index.post.ts
const { companyId, role } = requireTenant(event)  // única fonte do tenant
const input = validateRecursoInput(await readBody(event))
await assertCompanyRole(role, 'owner', ...)
const created = await repository.method({ companyId, userId: user.id, ...input })
```

```ts
// server/utils/<contexto>/repository.ts
return withTenant(companyId, null, userId, async (tx) => { ... })
```

## Regras Críticas

- `requireTenant(event)` = única fonte do tenant; `companyId` nunca no body
- `getRouterParam(event, '<recurso>Id')` casa com dir `[<recurso>Id]` (nunca `[id]`)
- Zod **sempre** (validators `validate*Input` em `server/utils/shared/validate.ts`)
- `withTenant(tenantId, locationId, userId, fn)` — os 3 aceitam `null` (limpa GUC → fail-closed)
- Repository usa `tx` do `withTenant`; conflito unicidade → `sendConflictError` (409)
- Schema: `companyId` NOT NULL + FK + RLS (4 policies, `OR get_location_id() IS NULL` = ADR-002)
- Rate limit user (60/min) no middleware `auth` — não repita no handler

## NUNCA Fazer

- ❌ Alterar `drizzle/`, RLS, auth logic sem ADR
- ❌ Criar Service layer — handler chama repository direto
- ❌ `withTenant` omitido em query Drizzle de tabela tenant-scoped
- ❌ Hard delete em dados fiscais (soft delete only)
- ❌ `CREATE POLICY` sem `get_tenant_id()` (fail-open)
- ❌ Importar entre contextos (identity ⤳ company) — ESLint bloqueia
- ❌ Commits sem `npm run lint` + `npm run typecheck` verdes

## Arquivos Protegidos

`drizzle/`, `server/utils/auth/**`, `server/api/auth/**`, `server/middleware/auth*.ts`, `server/utils/db/tenant-context.ts`, `server/utils/schema/**`, `scripts/verify-rls.ts`, security tests `*isolation*.test.ts`, `*rls*.test.ts`, `grants-parity.test.ts`

## Glossário

| Termo          | Significado                                       |
| -------------- | ------------------------------------------------- |
| Tenant         | = `company`                                       |
| RLS            | Row Level Security (PostgreSQL policies)          |
| GUC            | `app.tenant_id`, `app.location_id`, `app.user_id` |
| withTenant     | Helper que seta GUCs + roda callback em transação |
| Vertical Slice | Feature completa: API + Repo + Schema + Testes    |

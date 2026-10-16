# AGENTS.md — MERP

Instruções para agentes (IA/automação) trabalhando neste repositório. Baseado em `constitution.md`.

---

## Princípios (Resumo)

1. **Spec-Driven**: Código implementa specs em `specs/`. Divergência = bug.
2. **Vertical Slices**: `server/utils/<contexto>/` — autônomos, sem imports cruzados.
3. **Handler → Repository → Drizzle** — Sem Service layer.
4. **RLS Fail-Closed**: `withTenant` obrigatório; `merp_app` NOBYPASSRLS.
5. **Ponytail**: YAGNI, stdlib primeiro, deletar > adicionar, uma fonte por fato.
6. **Docs reflete código**: Atualize docs ao mudar código.

---

## Comandos Essenciais

| Ação                             | Comando                                  |
| -------------------------------- | ---------------------------------------- |
| Portão rápido (pré-commit)       | `npm run check`                          |
| Dev server                       | `npm run dev`                            |
| Testes (unit)                    | `npm test`                               |
| Testes (integração, precisa PG)  | `DB_AVAILABLE=true npm test`             |
| Lint                             | `npm run lint`                           |
| Typecheck                        | `npm run typecheck`                      |
| Format                           | `npm run format`                         |
| Migrações completas (banco novo) | `npm run db:migrate:full`                |
| Nova migração                    | `npx drizzle-kit generate --name <nome>` |
| Drizzle Studio                   | `npx drizzle-kit studio`                 |

---

## Padrão de Criação de Endpoint

URL = caminho do arquivo. Rota de recurso de empresa fica em
`/api/v1/companies/{companyId}/...` — o `companyId` vem do **path** (R5), nunca do body.
Veja `docs/07-reference/create-endpoint-guide.md` para o exemplo completo.

```ts
// server/api/v1/companies/[companyId]/<recurso>/index.post.ts
import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { repository } from '#shared/utils/<contexto>'
import {
  requireTenant,
  assertCompanyRole,
  sendUnauthorizedError,
  validateRecursoInput,
} from '#shared'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) sendUnauthorizedError('Authentication required.')

  // companyId vem do PATH (middleware tenant), nunca do body (R5).
  const { companyId, role } = requireTenant(event)
  const input = validateRecursoInput(await readBody(event))
  await assertCompanyRole(role, 'owner', 'You are not a member of this company', 'Not allowed')

  const created = await repository.method({ companyId, userId: user.id, ...input })
  setResponseStatus(event, 201)
  return created
})
```

```ts
// server/utils/<contexto>/repository.ts
export const repository = {
  async method({ companyId, userId, ... }) {
    // locationId: null = escopo company (limpa a GUC -> RLS fail-closed)
    return withTenant(companyId, null, userId, async (tx) => {
      // queries Drizzle usando tx
    })
  }
}
```

**Regras:**

- Rota nova em `/api/v1/companies/{companyId}/...` (R1/R5); só `api/auth/` e `api/health/` ficam fora
- `requireTenant(event)` é a única fonte do tenant; `companyId` nunca vem do body
- `getRouterParam(event, '<recurso>Id')` — a chave tem de casar com o dir `[<recurso>Id]`; nunca `[id]`
- `defineAuthHandler` (autenticado, sem tenant) / `defineEventHandler` (o resto) — não existe `definePublicHandler`
- Validação Zod **sempre** (validators `validate*Input` em `~~/server/utils/shared`)
- `withTenant(tenantId, locationId, userId, fn)` — os 3 aceitam `null` (limpa a GUC → fail-closed); `locationId: null` é o escopo company legítimo, não omissão
- Repository usa `tx` (transaction) do `withTenant`; conflito de unicidade → `sendConflictError` (409), não 500
- Schema: `companyId` NOT NULL + FK + RLS (4 policies, padrão `OR get_location_id() IS NULL` = ADR-002)
- Rate limit por usuário (60/min) já roda no middleware `auth` — não repita no handler

---

## Estrutura de Pastas (Resumo)

```
server/
├ api/                    # Handlers (h3) — URL = caminho do arquivo
│   ├ v1/                 # /api/v1 (recurso de empresa; R1/R5)
│   │   ├ me/             # /api/v1/me — usuário autenticado (6 endpoints)
│   │   └ companies/[companyId]/  # tenant no path: members, invitations,
│   │                       # orders, print, restaurant (33 endpoints)
│   ├ auth/               # /api/auth — fluxos Better Auth (7 endpoints)
│   └ health/             # /api/health — live/ready (públicos)
├ routes/                 # Rotas fora de /api: .well-known/security.txt (RFC 9116)
├ middleware/             # 00-no-store, 01/02-csrf, auth (sessão+rate limit), tenant, pii-audit
├ utils/
│   ├ auth/               # Contextos auth
│   │   ├ identity/       # queries.ts, client.ts (Better Auth)
│   │   ├ company/        # repository.ts, membership.ts
│   │   └ invite/         # repository.ts
│   ├ order/              # Core Order
│   ├ print/              # Print operacional
│   ├ restaurant/         # Restaurant Pack
│   ├ shared/             # handler, errors, security, audit, csrf, ip, validate, background
│   ├ schema/             # Drizzle tables (por feature)
│   └ db/                 # tenant-context.ts (withTenant), db.ts
shared/
├ auth.ts                 # Better Auth singleton
└ logger.ts
specs/                    # Specs normativas + ADRs
docs/                     # Documentação operacional
```

---

## O Que NUNCA Fazer

- ❌ Alterar `drizzle/` migrations, RLS policies, auth logic, fiscal/financeiro sem ADR
- ❌ Criar Service layer — handler chama repository direto
- ❌ Interface `IRepository` sem 2+ impls reais
- ❌ `withTenant` omitido em query Drizzle de tabela tenant-scoped
- ❌ Hard delete em dados fiscais (soft delete only)
- ❌ `CREATE POLICY` que não exige `get_tenant_id()` (fail-open). O escape `OR get_location_id() IS NULL` **não** é fail-open: ele só dispensa o filtro de location, o tenant continua exigido — é o padrão normativo de ADR-002
- ❌ Importar entre contextos (ex: identity ⤳ company) — ESLint bloqueia
- ❌ Commits sem `npm run lint` + `npm run typecheck` verdes
- ❌ Push/merge/PR sem revisão humana

---

## Arquivos Protegidos (Não Editar)

- `drizzle/` — migrations + schema
- `server/utils/auth/**` — auth logic
- `server/api/auth/**` — auth endpoints
- `server/middleware/auth*.ts` — auth middleware
- `server/utils/db/tenant-context.ts` — `withTenant`
- `server/utils/schema/**` — Drizzle schema
- `scripts/apply-custom-sql.ts` — RLS custom
- `server/utils/*isolation*.test.ts`, `*rls*.test.ts`, `grants-parity.test.ts` — security tests
- `constitution.md` — só via ADR

---

## Glossário Rápido

| Termo           | Significado                                          |
| --------------- | ---------------------------------------------------- |
| Tenant          | = `company`                                          |
| RLS             | Row Level Security (PostgreSQL policies)             |
| GUC             | `app.tenant_id`, `app.location_id`, `app.user_id`    |
| withTenant      | Helper que seta GUCs + roda callback em transação    |
| Vertical Slice  | Feature completa: API + Repo + Schema + Testes       |
| Bounded Context | Contexto delimitado (auth, order, print, restaurant) |
| ADR             | Architecture Decision Record                         |
| FR / SC         | Functional Requirement / Success Criteria            |

---

## Referências

- `constitution.md` — Princípios completos
- `specs/README.md` — Phase tracker
- `specs/decisions/` — ADRs
- `docs/07-reference/context-map.md` — Mapa de contextos com status
- `docs/07-reference/create-endpoint-guide.md` — Tutorial prático
- `docs/00-overview/glossary.md` — 44 termos explicados

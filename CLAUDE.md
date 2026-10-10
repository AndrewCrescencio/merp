# CLAUDE.md — MERP

Instruções para Claude Code trabalhando neste repositório. Baseado em `constitution.md` e `AGENTS.md`.

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

| Ação                             | Comando                                   |
| -------------------------------- | ----------------------------------------- |
| Dev server                       | `pnpm dev`                                |
| Testes (unit)                    | `pnpm test`                               |
| Testes (integração, precisa PG)  | `DB_AVAILABLE=true pnpm test`             |
| Lint                             | `pnpm lint`                               |
| Typecheck                        | `npx tsc --noEmit`                        |
| Format                           | `pnpm format`                             |
| Migrações completas (banco novo) | `pnpm db:migrate:full`                    |
| Nova migração                    | `pnpm drizzle-kit generate --name <nome>` |
| Drizzle Studio                   | `pnpm drizzle-kit studio`                 |

---

## Padrão de Criação de Endpoint

```ts
// server/api/<contexto>/<recurso>/<acao>.method.ts
import { defineAuthHandler } from '#shared/handler'
import { repository } from '#shared/utils/<contexto>'
import { z } from 'zod'

const schema = z.object({/* ... */})

export default defineAuthHandler(async (event) => {
  const { companyId, locationId, userId } = event.context.auth
  const input = await readValidatedBody(event, schema.parse)
  return repository.method({ companyId, locationId, userId, ...input })
})
```

```ts
// server/utils/<contexto>/repository.ts
export const repository = {
  async method({ companyId, locationId, userId, ... }) {
    return withTenant(companyId, locationId, userId, async (tx) => {
      // queries Drizzle usando tx
    })
  }
}
```

**Regras:**

- `defineAuthHandler` para autenticado, `definePublicHandler` para público
- Validação Zod **sempre**
- `withTenant(companyId, locationId, userId, fn)` — 3 IDs obrigatórios
- Repository usa `tx` (transaction) do `withTenant`
- Schema: `companyId` + `locationId` NOT NULL + RLS policy

---

## Estrutura de Pastas (Resumo)

```
server/
├ api/                    # Handlers (h3)
│   ├ auth/               # 21 endpoints flat
│   ├ health.get.ts       # Público
│   └ metrics.get.ts      # Público
├ middleware/             # auth, csrf, no-store, pii-audit
├ tasks/                  # Nitro tasks (purge, print queue)
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
- ❌ `withTenant` sem `locationId`
- ❌ Hard delete em dados fiscais (soft delete only)
- ❌ `CREATE POLICY` com `OR get_location_id() IS NULL` (fail-open)
- ❌ Importar entre contextos (ex: identity ⤳ company) — ESLint bloqueia
- ❌ Commits sem `pnpm lint` + `npx tsc --noEmit` verdes
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

| Termo           | Significado                                                                |
| --------------- | -------------------------------------------------------------------------- |
| Tenant          | = `company`                                                                |
| RLS             | Row Level Security (PostgreSQL policies)                                   |
| GUC             | `app.current_company_id`, `app.current_location_id`, `app.current_user_id` |
| withTenant      | Helper que seta GUCs + roda callback em transação                          |
| Vertical Slice  | Feature completa: API + Repo + Schema + Testes                             |
| Bounded Context | Contexto delimitado (auth, order, print, restaurant)                       |
| ADR             | Architecture Decision Record                                               |
| FR / SC         | Functional Requirement / Success Criteria                                  |

---

## Referências

- `constitution.md` — Princípios completos
- `specs/README.md` — Phase tracker
- `specs/decisions/` — ADRs
- `docs/07-reference/context-map.md` — Mapa de contextos com status
- `docs/07-reference/create-endpoint-guide.md` — Tutorial prático
- `docs/00-overview/glossary.md` — 44 termos explicados

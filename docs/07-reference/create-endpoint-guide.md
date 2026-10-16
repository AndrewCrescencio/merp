---
title: 'Como Criar um Endpoint (handler → Repository) — MERP'
slug: 'create-endpoint-guide'
category: 'guide'
status: 'active'
version: '2.0.0'
owner: '@tech-lead'
reviewers: ['@architect']
module: 'getting-started'
tags: ['handler', 'repository', 'endpoint', 'tutorial', 'pattern']
audience: ['dev', 'qa']
created: '2026-10-10'
updated: '2026-10-16'
review-cycle: 'quarterly'
related:
  - 'context-map'
  - 'cli-commands'
replaces: []
replaced-by: null
---

# Como Criar um Endpoint Seguindo handler → Repository

Guia prático usando arquivos reais do repo. Padrão: **handler → Repository → Drizzle** (sem Service layer).

As regras de forma (prefixo, naming, verbos, tenant, params) são **R1–R8**, em `specs/000-foundation/rest-api.md`, e as partes mecânicas são impostas no CI por `npm run check:routes`.

---

## 0. Onde a rota vive (R1/R5)

**URL = caminho do arquivo** em `server/api/`, sem `/index` no fim:

```
server/api/v1/companies/[companyId]/invitations/index.post.ts
                    └────────── URL: POST /api/v1/companies/{companyId}/invitations
```

| Regra            | Exigência                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **R1** prefixo   | Toda rota nova é `/api/v1/...`. Só `auth/` (fluxos de autenticação) e `health/` ficam fora — ADR-005 e §9 da constituição. |
| **R1** tenant    | Recurso de empresa leva o `companyId` **no path**: `/api/v1/companies/{companyId}/...`. Ele **nunca** vem do body.         |
| **R1** naming    | Segmentos kebab-case, substantivos no plural, **id no path**.                                                              |
| **R2** arquivo   | Coleção `index.<get\|post>.ts`; item `[<recurso>Id]/index.<get\|patch\|delete>.ts`; ação `[<recurso>Id]/<verbo>.post.ts`.  |
| **R2** param     | Dir `[orderId]`, **nunca** `[id]`; a chave de `getRouterParam` tem de casar com o dir.                                     |
| **R4** transição | Estado muda por `POST {recurso}/{id}/{verbo}` (`/cancel`, `/complete`) — **sem `PATCH /status`** genérico.                 |

`npm run check:routes` falha o CI em qualquer violação dessas — rode antes de commitar.

### O que acontece antes do seu handler

```
00-no-store → 01-csrf-token → 02-csrf-validate → auth → tenant → pii-audit
```

- **`auth`** (`server/middleware/auth.ts`): resolve sessão, aplica o **rate limit por usuário (60/min)**, emite `session_validated` e preenche `event.context.auth = { user, session }`. Rotas públicas são as da lista `publicRoutes`.
- **`tenant`** (`server/middleware/tenant.ts`): para `/api/v1/companies/{companyId}/...`, extrai o `companyId` **do path** por regex (middleware global não tem `getRouterParam`), valida membership e grava `event.context.tenant = { companyId, role }`. Não-membro **ou** empresa inexistente → mesmo **404** (não vaza existência); membro sem papel → **403**.

> Não repita o rate limit no handler: ele já rodou no middleware. Chamar `checkUserRateLimit` de novo cobraria 2 tokens por request e dobraria o teto documentado.

---

## 1. Handler — `server/api/v1/companies/[companyId]/invitations/index.post.ts`

```ts
import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { inviteRepository } from '~~/server/utils/auth/invite/repository'
import {
  assertCompanyRole,
  checkIpRateLimit,
  createAuthEvent,
  getClientIp,
  sendUnauthorizedError,
  validateInviteInput,
  requireTenant,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  // companyId vem do path (middleware tenant), nunca do body (R1/R5).
  const { companyId, role } = requireTenant(event)
  const { email } = validateInviteInput(await readBody(event))

  await assertCompanyRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can invite members',
  )

  const created = await inviteRepository.createInvite({
    companyId,
    email,
    invitedBy: user.id,
  })

  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'invite_created',
    ipAddress: getClientIp(event) || null,
    metadata: { companyId, invitedEmail: email },
  })

  setResponseStatus(event, 201)
  return {
    id: created.id,
    companyId: created.companyId,
    email: created.email,
    expiresAt: created.expiresAt,
    token: created.token,
  }
})
```

**Pontos-chave:**

- `defineEventHandler` direto — a autenticação já veio do middleware `auth`, e o tenant do middleware `tenant`
- **`requireTenant(event)` → `{ companyId, role }`** é a única fonte do escopo de tenant (R5). Nunca leia `companyId` do body
- Validação Zod centralizada em `~~/server/utils/shared` (`validateInviteInput`), não inline
- `assertCompanyRole(role, ...)` faz a autorização por papel (→ 403)
- `createAuthEvent` registra a mutação em `auth_event`
- `setResponseStatus(event, 201)` na criação (R8)

> `defineAuthHandler` (`server/utils/shared/handler.ts`) existe e também é válido — ele checa sessão de novo e devolve o `user` como 2º argumento — mas **não resolve tenant**: quem precisa de `companyId` no path usa `requireTenant`.

---

## 2. Repository — `server/utils/auth/invite/repository.ts` (trecho)

```ts
export class InviteRepository {
  async createInvite(input: CreateInviteInput): Promise<CreatedInviteResult> {
    try {
      return await withTenant(input.companyId, null, input.invitedBy, async (tx) => {
        const { token, tokenHash } = generateToken()
        const [created] = await tx
          .insert(invite)
          .values({
            companyId: input.companyId,
            email: input.email,
            invitedBy: input.invitedBy,
            tokenHash,
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          })
          .returning()
        return { ...toInviteResult(created!), token }
      })
    } catch (error: unknown) {
      if (isPgConflict(error)) {
        sendConflictError('Invite already exists for this company')
      }
      return handleDatabaseError(error)
    }
  }
}
```

**Pontos-chave:**

- `withTenant(tenantId, locationId, userId, fn)` — **obrigatório** em toda query. Assinatura real: os três aceitam `string | null`, e `null` **limpa a GUC** (fail-closed) em vez de herdar o valor de uma transação externa
  - `locationId: null` = escopo **company** (tabelas sem `location_id`) — é o caso legítimo aqui, não uma omissão
  - 4º param opcional `existingTx` para aninhar numa transação já aberta
- Usa o `tx` recebido — **nunca** o `db` direto
- `isPgConflict` → `sendConflictError` (**409**) em vez de deixar virar 500
- `handleDatabaseError` traduz o resto para o formato de erro canônico

---

## 3. Schema — `server/utils/schema/invite.ts` (trecho)

```ts
export const invite = pgTable(
  'invite',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: text('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    // AUD-01: hash SHA-256 do token secreto de aceite (nunca o valor em claro).
    tokenHash: text('token_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('invite_company_email_idx').on(table.companyId, table.email),
    index('invite_pending_token_hash_idx')
      .on(table.tokenHash)
      .where(sql`${table.acceptedAt} IS NULL`),
  ],
)
```

Uma tabela por arquivo em `server/utils/schema/`, exportada pelo `index.ts`. Colunas de tenant (`company_id`, `location_id`) são `notNull` e FK para a tabela pai. Tabelas **novas** usam UUID nativo (ADR-006).

---

## 4. RLS Policy (aplicada via `scripts/apply-custom-sql.ts`)

O padrão normativo (**ADR-002**, reafirmado em `drizzle/0025_force_rls_fixes.sql`) é **uma policy por operação** (`SELECT`/`INSERT`/`UPDATE`/`DELETE`), com os helpers `get_tenant_id()`/`get_location_id()` (fail-closed: `NULLIF(current_setting(..., true), '')`):

```sql
-- Padrão location-scoped (o clause OR é parte do padrão, não opcional)
CREATE POLICY "party_select_policy" ON "party" FOR SELECT
  USING (company_id = get_tenant_id()
         AND (location_id = get_location_id() OR get_location_id() IS NULL));

DROP POLICY IF EXISTS "party_insert_policy" ON "party";
CREATE POLICY "party_insert_policy" ON "party" FOR INSERT
  WITH CHECK (company_id = get_tenant_id()
              AND (location_id = get_location_id() OR get_location_id() IS NULL));
-- + party_update_policy / party_delete_policy
```

- **`OR get_location_id() IS NULL` é obrigatório**: 107 das 108 linhas com `get_location_id()` o trazem. Sem ele, `withTenant(companyId, null, ...)` (escopo company) negaria **todas** as linhas e a tabela ficaria inacessível
- Policies **não** declaram `TO <role>` (0 de 180 no repo) — o papel vem de `drizzle/0020_app_role_default_privileges.sql` + `FORCE ROW LEVEL SECURITY`
- Tabelas company-scoped (sem `location_id`) usam só `company_id = get_tenant_id()`
- Tabelas dependentes de outra (`order_dine_in`, `order_takeout`) usam `EXISTS` sobre a pai

---

## Checklist para Novo Endpoint

- [ ] Rota nova em `server/api/v1/companies/[companyId]/<recurso>/` (R1/R5)
- [ ] Nome de arquivo `index.<método>.ts` ou `<verbo>.post.ts` (R2); dir `[<recurso>Id]`, nunca `[id]`
- [ ] `defineEventHandler` + sessão de `event.context.auth` / `event.context.user`
- [ ] **`requireTenant(event)`** → `companyId`/`role` (nunca do body)
- [ ] `getRouterParam(event, '<recurso>Id')` com a chave **igual** ao dir
- [ ] Validação Zod em `~~/server/utils/shared` (validators nomeados `validate*Input`)
- [ ] Autorização por papel via `assertCompanyRole` quando houver (→ 403)
- [ ] Chama **um** método do Repository correspondente
- [ ] **Repository** em `server/utils/<contexto>/repository.ts`
- [ ] Repository usa `withTenant(tenantId, locationId, userId, async (tx) => { ... })` — `null` onde não há escopo
- [ ] Conflito de unicidade → `isPgConflict` + `sendConflictError` (409), não 500
- [ ] Schema em `server/utils/schema/<tabela>.ts` com `company_id` NOT NULL
- [ ] RLS: 4 policies (uma por operação) com o padrão `OR get_location_id() IS NULL`
- [ ] Criação devolve **201**; mutação registrada em `createAuthEvent`
- [ ] `npm run check:routes` verde
- [ ] Testes: unit (mock tx) + integration (DB real com `DB_AVAILABLE=true`)

---

## Padrões de Repository no Repo

| Padrão                                         | Contextos                   | Exemplo                                                                                                      |
| ---------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Object + type alias** (recomendado p/ novos) | Restaurant, Order, Print    | `export const restaurantRepository = { async method() {} }`                                                  |
| **Class + singleton**                          | Company, Membership, Invite | `export class InviteRepository { async method() {} } export const inviteRepository = new InviteRepository()` |
| **Functions (via Better Auth)**                | Identity                    | `export async function signInUser() {}` em `queries.ts`                                                      |

**Para novos contextos:** use **Object + type alias** (menos boilerplate, mesmo poder).

---

## Comandos Úteis

```bash
# Convenção de rotas (R1/R2/R5) — roda no CI
npm run check:routes

# Nova migração após criar schema
npx drizzle-kit generate --name add_restaurant_table

# Aplicar migrações + RLS (banco novo)
npm run db:migrate:full

# Testes unitários (npx vitest run: `npm test -- <arquivo>` faz o vitest
# descartar o filtro e rodar a suíte inteira)
npx vitest run server/utils/restaurant/repository.spec.ts

# Testes integração (requer Postgres)
DB_AVAILABLE=true npx vitest run server/utils/restaurant/repository.test.ts

# Portão completo (format + lint + typecheck + rotas)
npm run check
```

---

## Erros Comuns a Evitar

| Erro                                         | Correto                                                             |
| -------------------------------------------- | ------------------------------------------------------------------- |
| Ler `companyId` do body                      | `requireTenant(event)` — o tenant vem do path (R5), fail-closed     |
| `getRouterParam(event, 'id')` em `[orderId]` | A chave devolve `undefined` e falha só em runtime — use `'orderId'` |
| Dir `[id]` genérico                          | `[<recurso>Id]` (R2) — `check:routes` rejeita                       |
| Rodar `checkUserRateLimit` no handler        | Já rodou no middleware `auth`; de novo = 2 tokens por request       |
| Esquecer `withTenant`                        | Sempre `withTenant` em repository methods                           |
| Usar `db` direto (sem tx)                    | Usar `tx` passado pelo `withTenant`                                 |
| Omitir o `OR get_location_id() IS NULL`      | Padrão ADR-002 — sem ele a tabela company-scoped fica inacessível   |
| Conflito de unicidade virando 500            | `isPgConflict(error)` → `sendConflictError` (409)                   |
| Handler chama Drizzle direto                 | Handler → Repository → Drizzle                                      |
| Criar Service layer                          | Não — handler chama repository direto                               |
| Interface `IRepository` sem 2+ impls         | Concreto é suficiente; interface só se múltiplas impls reais        |

---

## Referências

- `specs/000-foundation/rest-api.md` — R1–R8 (forma, verbos, tenant, params, status)
- `specs/decisions/ADR-005-api-versioning.md` — split `/api/v1` × `/api/auth`
- `specs/decisions/ADR-002-location-scope.md` — padrão de policy location-scoped
- `specs/decisions/ADR-008` — Vertical slices package by feature
- `docs/07-reference/context-map.md` — Mapa de todos contextos
- `server/middleware/tenant.ts` — resolução do tenant a partir do path
- `server/utils/shared/handler.ts` — `defineAuthHandler`, `definePublicHandler`
- `server/utils/shared/errors.ts` — `send*Error`, `handleDatabaseError`
- `server/utils/shared/auth-context.ts` — `requireTenant`, `assertCompanyRole`
- `server/utils/db/tenant-context.ts` — `withTenant` implementation

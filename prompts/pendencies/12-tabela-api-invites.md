# 12 — Tabela e API de Invites

> **RESOLVIDO em 2026-08-01** — implementado integralmente como parte da correção
> do self-join aberto (substitui `companies.join.post.ts`):
>
> - Tabela `invite` em `server/utils/schema.ts` + migration `drizzle/0006_invites_rls.sql`
>   (RLS: INSERT com `is_company_owner`, demais por tenant).
> - Repositório: `createInvite`, `findPendingInvite`, `listCompanyInvites`,
>   `acceptInvite` (atômico: verifica pendência + cria member + marca accepted).
> - Endpoints: `POST /api/auth/invite` (owner), `GET /api/auth/invites` (member),
>   `POST /api/auth/invites/accept` (email da sessão, nunca do body) + specs.
> - Testes de integração em `repository.test.ts` (duplicado → 409, expirado → null).

## Contexto (histórico)

Resolva a pendência crítica #4 de `docs/pendencies.md` — tabela e API de Invites.

Data model (`specs/001-auth-context/data-model.md`) define a entidade `Invite`: id,
company_id (FK Company), email, invited_by (FK User), accepted_at (NULL), expires_at
(NOT NULL, purged 30d após expirar), created_at. Unique em (company_id, email). Índice
em (email) com `accepted_at IS NULL`. RLS por company_id (ver seção Tenant Isolation).

### 1. Schema — `server/utils/schema.ts`

Adicione a tabela `invite` seguindo o padrão das existentes (drizzle pgTable, id UUID
default `gen_random_uuid()`, FKs com `references`):

```typescript
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
    invitedBy: text('invited_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('invite_company_email_idx').on(table.companyId, table.email),
    index('invite_pending_email_idx')
      .on(table.email)
      .where(sql`${table.acceptedAt} IS NULL`),
  ],
)
```

### 2. Migration SQL + RLS

Siga o padrão de `drizzle/0005_misty_silver_sable.sql` (arquivo criado manualmente com o
SQL completo, depois `npx drizzle-kit generate` para atualizar o journal em `drizzle/meta`).
O próximo nome sequencial é `0006_*` (confira o journal). Inclua:

- `CREATE TABLE invite ...` (idempotente se possível)
- Unique constraint em (company_id, email)
- `ALTER TABLE invite ENABLE ROW LEVEL SECURITY;`
- Política SELECT: `company_id = get_tenant_id()`
- Política UPDATE/DELETE: `company_id = get_tenant_id()`
- Política INSERT: `WITH CHECK (true)` (app-layer valida ownership)

### 3. Repositório — `server/utils/auth/repository.ts`

Adicione ao `IAuthRepository` e implemente (com `withTenant` para operações tenant-scoped;
erro `23505` → 409 `conflict` 'Invite already exists for this company'):

- `createInvite(input: { companyId: string; email: string; invitedBy: string }): Promise<InviteResult>` — `expiresAt = now + 7 dias`.
- `findPendingInvite(companyId: string, email: string): Promise<InviteResult | null>` — sem `withTenant` (busca por email, usada no accept), com `acceptedAt IS NULL` e `expiresAt > now`.
- `listCompanyInvites(companyId: string): Promise<InviteResult[]>` — com `withTenant`.
- `acceptInvite(companyId: string, email: string): Promise<InviteResult>` — marca `acceptedAt = now` com `withTenant`; transação com `createCompanyMember` se preferir.

Exporte o tipo `InviteResult` (id, companyId, email, invitedBy, acceptedAt, expiresAt, createdAt).

### 4. Endpoints

- `POST /api/auth/invite` — auth. Body `{ companyId, email }`. Valida email (formato simples).
  Exige `getCompanyMembershipRole(user.id, companyId) === 'owner'` (senão 403). Cria convite.
  Registra `auth_event` `invite_created` com metadata `{ companyId, email }`.
- `GET /api/auth/invites` — auth. Query `?companyId=`. Exige ser member (senão 403). Retorna
  `{ invites: [...] }`.
- `POST /api/auth/invites/accept` — auth. Body `{ companyId }`. Busca convite pendente por
  `companyId + user.email`; se não existir/expirado → 404 `not_found`; se já for member →
  409 `conflict`; senão cria membership (role `member`) e marca `acceptedAt`. Registra
  `auth_event` `invite_accepted`.

### 5. Testes

- Specs unitários co-localizados para os 3 endpoints (mock do repositório, padrão de
  `login.post.spec.ts`).
- Casos de integração em `server/utils/auth/repository.test.ts` (com skip se DB indisponível):
  criar convite, duplicado → 409, listar, aceitar, aceitar já aceito/expirado → null.

### Verificação

```bash
npx vitest run server/api/auth/ server/utils/auth/repository.test.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).

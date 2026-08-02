# Revisão de Multi-Tenancy: `withTenant` + RLS

> Data: 2026-08-01
> Escopo: `server/utils/auth/tenant-context.ts`, `server/utils/auth/helpers.ts`,
> `server/utils/auth/repository.ts`, `server/utils/db.ts`, `drizzle/0005_misty_silver_sable.sql`
> Objetivo: documentar como o isolamento de tenant funciona hoje, o que está
> correto segundo boas práticas, e os problemas de segurança/arquitetura encontrados.

---

## 1. Como o `withTenant` funciona

Arquivo: `server/utils/auth/tenant-context.ts`

```ts
import { db } from '../db'
import { sql } from 'drizzle-orm'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function withTenant<T>(
  tenantId: string | null,
  userId: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    if (tenantId) {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
    }
    if (userId) {
      await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`)
    }
    return await fn(tx)
  })
}
```

Fluxo:

1. Abre uma transação Drizzle (`db.transaction`).
2. Define `app.tenant_id` e/ou `app.user_id` via `set_config(..., true)` —
   o terceiro argumento escopa a variável **à transação** (equivalente a `SET LOCAL`).
3. Executa o callback recebendo `tx` — todas as queries do método passam por `tx`.
4. Commit/rollback limpa as variáveis automaticamente.

As policies RLS das tabelas consultam essas variáveis via funções helper
(`drizzle/0005_misty_silver_sable.sql`):

```sql
CREATE OR REPLACE FUNCTION get_tenant_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '');
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_user_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '');
$$ LANGUAGE SQL STABLE;
```

### Padrão de uso no repositório (`repository.ts`)

| Método                       | Args                | Motivo                                                                  |
| ---------------------------- | ------------------- | ----------------------------------------------------------------------- |
| `createCompanyMember` (L329) | `companyId, userId` | Cria membro escopado ao tenant                                          |
| `findUserCompanies` (L385)   | `null, userId`      | Lista empresas do usuário — sem tenant fixo, restrito por `app.user_id` |
| `isCompanyMember` (L408)     | `companyId, userId` | Verificação com ambos contextos                                         |
| `setActiveCompany` (L423)    | `companyId, null`   | Atualiza sessão sem contexto de usuário                                 |
| `softDeleteCompany` (L466)   | `companyId, null`   | Delete membros + soft delete numa transação                             |

- `tenantId` sempre que a query trata dados da empresa; `null` para operações globais.
- `userId` quando a policy consulta `app.user_id` (ex.: `company_members`).
- Queries sem `withTenant` (`findCompanyById`, `searchCompanies`, `deactivateUser`)
  operam dados globais (empresa, sessão, usuário) — correto.

Métodos de convite (implementados em 2026-08-01): `createInvite` (com
`withTenant(companyId, invitedBy)`), `findPendingInvite`/`listCompanyInvites` (com
`withTenant(companyId, null)`), `acceptInvite` (com `withTenant(companyId, userId)` —
atômico: verifica pendência + insere member + marca `acceptedAt` numa transação só).

### Fluxo de convites (substitui o self-join aberto)

O endpoint `companies.join.post.ts` (qualquer usuário autenticado entrava em
qualquer empresa) foi **removido**. Entrada em empresa é exclusivamente por convite:

| Endpoint                           | Guard                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `POST /api/auth/invite`            | owner da empresa (via `getCompanyMembershipRole`)                                     |
| `GET /api/auth/invites?companyId=` | member da empresa                                                                     |
| `POST /api/auth/invites/accept`    | autenticado; usa **email da sessão** (nunca do body); convite pendente + não expirado |

Propriedades de segurança da implementação:

- Tabela `invite` com RLS: INSERT restrito a `is_company_owner(company_id)`;
  SELECT/UPDATE/DELETE por `company_id = get_tenant_id()` (`drizzle/0006_invites_rls.sql`).
- `acceptInvite` é atômico (um `withTenant`): convite e membership na mesma
  transação — sem race de aceite duplo (unique `(company_id, email)` no invite e
  `(company_id, user_id)` no member; duplicados → 409).
- Email do convidado vem da sessão autenticada no accept — um usuário só aceita
  convites endereçados ao próprio email.
- Expiração: 7 dias (`INVITE_TTL_MS`); convite expirado/aceito → 404.
- Erros H3 (`sendNotFoundError`/`sendConflictError`) atravessam o `catch` do
  repositório via `error instanceof H3Error` — não viram 503.

### Fail-closed

Sem `withTenant` (ou com contexto errado), `current_setting(..., true)` retorna `NULL`
e as policies retornam **zero linhas** para tabelas tenant-scoped. Errar é seguro.

---

## 2. O que está correto (boas práticas)

1. **`set_config(..., true)` dentro de transação** — é o padrão recomendado
   (Supabase/PostgREST). Com pool de conexões, variável de sessão vazaria entre
   requests; escopo transacional limpa tudo no commit/rollback.
2. **Fail-closed via RLS** — sem contexto → 0 rows, não acesso liberado.
3. **Callback recebe `tx` tipado** — o tipo é extraído automaticamente do
   `db.transaction`, garantindo que as queries usem a transação.
4. **Transação por método** — aceitável na escala atual.

---

## 3. Problemas encontrados

### 🔴 CRÍTICO 1: RLS é bypassado pelo owner da tabela

- `server/utils/db.ts` usa uma única `postgres(process.env.DATABASE_URL!)` — a mesma
  role que roda o `drizzle-kit migrate` e é **dona das tabelas**.
- O Postgres **não aplica RLS para o owner da tabela** (nem superuser), a menos que
  a tabela tenha `FORCE ROW LEVEL SECURITY`.
- A migration `0005` faz apenas `ENABLE ROW LEVEL SECURITY` (sem FORCE).
- **Consequência:** se a role de app = role dona (o caso atual), as policies são
  **ignoradas em produção** — o `withTenant` vira decoração. Na dev local funciona
  por acaso (nada é testado como atacante).

**Fix:**

```sql
-- 1. Role de app separada (não dona, não superuser)
-- 2. Aplicar em toda tabela tenant-scoped:
ALTER TABLE company FORCE ROW LEVEL SECURITY;
ALTER TABLE company_member FORCE ROW LEVEL SECURITY;
-- 3. Grants para a role de app (SELECT/INSERT/UPDATE/DELETE)
```

**✅ Implementado em 2026-08-01 (prompt 09):** migration `drizzle/0007_abnormal_talkback.sql`
aplica `FORCE ROW LEVEL SECURITY` em `company`, `company_member` e `invite`;
`server/utils/db.ts` usa `APP_DATABASE_URL` (role de app) com fallback para
`DATABASE_URL` (owner, dev local).

### Passos de infra para produção (P1)

1. Criar a role de app (não dona, não superuser), como owner:
   ```sql
   CREATE ROLE merp_app WITH LOGIN PASSWORD '...';
   ```
2. Grants (rodar como owner):
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON company, company_member, "user", "session", account, verification TO merp_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO merp_app;
   ```
3. Migrations continuam rodando com a role owner (`DATABASE_URL`); a app roda com
   `APP_DATABASE_URL` (role `merp_app`). Sem `APP_DATABASE_URL` definido, o código
   cai no fallback para `DATABASE_URL` (dev local apenas).
4. Variáveis novas em `.env.example` e `docker-compose.prod.yml`:
   `APP_DATABASE_URL` (em prod compose, fallback para vazio = owner em dev local).

> **Nota de aplicação:** como `drizzle/0000_bizarre_titania.sql` nunca existiu no
> repo, `drizzle-kit migrate` falha silenciosamente em banco vazio. Para ambientes
> dev use `drizzle-kit push` + aplicar o SQL custom (0005/0006/0007+) via psql.
> Consertar o 0000 é pendência separada do repo.

### 🔴 CRÍTICO 2: `cm_insert_policy` é `WITH CHECK (true)`

`drizzle/0005_misty_silver_sable.sql` L31-32:

```sql
CREATE POLICY cm_insert_policy ON company_member FOR INSERT
  WITH CHECK (true);
```

- Qualquer um pode inserir `company_member` de **qualquer empresa**.
- O comentário diz "app-layer validates membership", mas hoje o repositório
  **não valida o role do caller em lugar nenhum** — `createCompanyMember(companyId, userId, role)`
  aceita `role` arbitrário.
- **Consequência:** quando o endpoint de adicionar membro existir, qualquer usuário
  autenticado pode se auto-promover a `owner` de qualquer empresa (escalada de
  privilégio).

**Fix (opcional, em SQL):** policy que verifica ownership via função SQL:

```sql
CREATE OR REPLACE FUNCTION is_company_owner(cid text) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_member
    WHERE company_id = cid
      AND user_id = get_user_id()
      AND role = 'owner'
  );
$$ LANGUAGE SQL STABLE;

CREATE POLICY cm_insert_policy ON company_member FOR INSERT
  WITH CHECK (is_company_owner(company_id));
```

### ⚠️ MÉDIO 3: Autorização por argumento explícito = risco IDOR

- Todos os métodos recebem `companyId` do chamador (`softDeleteCompany(companyId)`,
  `createCompanyMember(companyId, ...)`, etc.) — o tenant vem do caller, não da sessão.
- **Consequência:** se o endpoint não validar "o usuário logado é dono/membro dessa
  empresa?", qualquer usuário autenticado pode operar em qualquer empresa.
- Hoje `companies.post.ts` cria a própria empresa (ok); checagem de ownership
  **não confirmada** em `companies.delete.post.ts`.
- **Já resolvido parcialmente:** o self-join aberto (`companies.join.post.ts`) foi
  **removido** — entrada em empresa agora é exclusivamente via convite
  (`invite.post.ts` owner-only, `invites.get.ts` member-only, `invites.accept.post.ts`
  com email da sessão). Guard `assertCompanyRole` para delete/update pendente
  (prompt 11).

**Fix:** guard centralizado chamado antes de toda operação tenant-scoped:

```ts
async function assertCompanyRole(role: string | null, requiredRole: string, ...): Promise<void> {
  // 403 se não for membro ou role insuficiente
}
```

### ⚠️ MÉDIO 4: `handleDatabaseError` engole violações de RLS

- Tentativa cross-tenant vira `503 service_unavailable` (via `handleDatabaseError`)
  em vez de `403`. Máscara o problema e confunde debugging.

**Fix:** `classifyDatabaseError` distingue `42501` (insufficient_privilege) /
`P0001` (raise da policy) → `403 forbidden` (logado como warn); demais erros
(conexão etc.) → `503`.

### ⚠️ MÉDIO 5: Sem teste de isolamento entre tenants

- `server/utils/auth/repository.test.ts` existe (integração), mas **não** há teste:
  usuário da empresa A tenta ler dados da empresa B → **0 rows**.

**Fix:** teste de integração `.test.ts` com duas empresas + dois usuários provando
isolamento bidirecional (SELECT e UPDATE).

### ⚠️ BAIXO 6: Uma transação por método

- Ok na escala atual; impede operações compostas (vários métodos num único
  `withTenant`). `db.transaction` não é reentrante.
- **Decisão: implementar (não adiar)** — `withTenant` passa a aceitar uma transação
  existente (reuso em vez de aninhamento), com `createCompanyWithOwner` como prova
  do padrão. Detalhes no prompt `prompts/14-with-tenant-aninhavel.md`.

---

## 4. O que é IDOR (Insecure Direct Object Reference)

Vulnerabilidade onde o app usa um identificador fornecido pelo usuário (URL/body)
para acessar ou alterar um recurso **sem verificar permissão sobre ele**.

Exemplo:

```http
POST /api/auth/companies/delete
{ "companyId": "empresa-do-concorrente" }
```

Se o endpoint não verifica que o usuário logado é dono, qualquer autenticado pode
deletar empresas alheias.

Distinção importante:

- **RLS** define _qual tenant_ o código pode tocar.
- **IDOR** é a ausência da checagem _qual usuário pode tocar qual tenant_.

O `withTenant` escopa corretamente o tenant, mas **o valor do tenant vem do
atacante** — sem checagem de ownership, é IDOR.

---

## 5. Plano de correção priorizado

| #   | Severidade | Ação                                                       | Onde                                       | Prompt                                     |
| --- | ---------- | ---------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| 1   | 🔴 Crítica | Role de app separada + `FORCE ROW LEVEL SECURITY` + grants | Migrations + infra                         | `prompts/09-force-rls-role-app.md`         |
| 2   | 🔴 Crítica | Policy de INSERT/UPDATE com verificação real de owner      | `drizzle` (nova migration)                 | `prompts/10-policy-insert-owner.md`        |
| 3   | ⚠️ Alta    | Guard `assertCompanyRole` em todo endpoint tenant-scoped   | `server/utils/auth/helpers.ts` + endpoints | `prompts/11-guards-ownership-endpoints.md` |
| 4   | ⚠️ Média   | Tratar `42501`/`P0001` como 403, nunca 503                 | `server/utils/auth/helpers.ts`             | `prompts/12-mapper-erros-rls.md`           |
| 5   | ⚠️ Média   | Teste de integração de isolamento entre tenants            | `repository.test.ts`                       | `prompts/13-teste-isolamento-tenants.md`   |
| 6   | ⚠️ Baixa   | `withTenant` aninhável (reuso de transação)                | `tenant-context.ts`                        | `prompts/14-with-tenant-aninhavel.md`      |

Ordem de execução: 09 → 10 → 11 → 12 → 13 → 14 → `prompts/15-verificacao-final.md`.
**Nenhum item é adiado.**

---

## 6. Referências

- `server/utils/auth/tenant-context.ts` — helper `withTenant`
- `server/utils/auth/helpers.ts` — erros, rate-limit, lockout, `handleDatabaseError`
- `server/utils/auth/repository.ts` — uso do `withTenant` (L329, 385, 408, 423, 466)
- `server/utils/db.ts` — conexão única (problema #1)
- `drizzle/0005_misty_silver_sable.sql` — RLS, policies, funções helper
- `docs/pendencies.md` — pendências anteriores (#8: remoção do `withTenant` duplicado — ✅ resolvida)

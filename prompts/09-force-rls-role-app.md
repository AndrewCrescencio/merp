# 09 — FORCE ROW LEVEL SECURITY + role de app separada (P1 crítica)

> **ESTADO (2026-08-01):** nada deste prompt foi implementado ainda. Ambiente
> preparado: Postgres rodando via Docker, banco `merp` e `merp_test` com schema
> atual (via `drizzle-kit push` — ver nota de migração abaixo).

## Contexto

`server/utils/db.ts` usa uma única `DATABASE_URL` — a mesma role que roda o
`drizzle-kit migrate` e é **dona das tabelas**. O Postgres **não aplica RLS para o
owner da tabela** (nem superuser) a menos que a tabela tenha
`FORCE ROW LEVEL SECURITY`. A migration `0005` só faz `ENABLE ROW LEVEL SECURITY` —
portanto as policies são ignoradas quando a role de app é a dona.

## Alterações

### 1. Migration nova com FORCE RLS

**Numeração: o próximo arquivo livre é `0007`** (`0006_invites_rls.sql` já existe).

Crie migration custom:

```bash
npx drizzle-kit generate --custom
```

Preencha o arquivo gerado (ex.: `0007_*.sql`) com:

```sql
-- Force RLS: policies passam a valer também para o owner da tabela
ALTER TABLE company FORCE ROW LEVEL SECURITY;
ALTER TABLE company_member FORCE ROW LEVEL SECURITY;
ALTER TABLE invite FORCE ROW LEVEL SECURITY;
```

> **Nota sobre aplicação (importante):** o arquivo `drizzle/0000_bizarre_titania.sql`
> nunca existiu no repo (o journal o referencia) — `drizzle-kit migrate` falha
> silenciosamente em banco vazio. Para ambientes dev use:
> `drizzle-kit push` (cria tabelas a partir do schema) + aplicar o SQL custom
> (0005/0006/0007+) via psql. Consertar o 0000 é pendência separada do repo.

### 2. Suporte a role de app no código

Em `server/utils/db.ts`, troque a conexão para usar `APP_DATABASE_URL` quando
existir (a role de app), com fallback para `DATABASE_URL` (owner, dev local):

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.APP_DATABASE_URL || process.env.DATABASE_URL!
const queryClient = postgres(connectionString)
export const db = drizzle(queryClient, { schema })
```

### 3. Documentar passos de infra no review

Atualize `docs/multi-tenancy/withtenant-rls-review.md` (seção P1) com os passos de
produção:

1. Criar role de app (não dona, não superuser):
   ```sql
   CREATE ROLE merp_app WITH LOGIN PASSWORD '...';
   ```
2. Grants (rodar como owner):
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON company, company_member, "user", "session", account, verification TO merp_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO merp_app;
   ```
3. Migrations continuam rodando com a role owner (`DATABASE_URL`); a app roda com
   `APP_DATABASE_URL` (role merp_app).
4. Atualizar `.env.example` e o README/compose com a nova variável.

## Testes

- Rodar os testes existentes com `APP_DATABASE_URL` desativado (fallback) e ativado.
- Teste manual de integração (pode ir no prompt 13): query direta via `db` (sem
  `withTenant`) em tabela tenant-scoped retorna 0 rows mesmo com `FORCE RLS` e role
  de app.

## Verificação

```bash
npx drizzle-kit migrate
docker compose exec -T postgres psql -U merp -d merp -c "\d+ company"
# deve exibir "Row security: forced"
npx vitest run server/
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).

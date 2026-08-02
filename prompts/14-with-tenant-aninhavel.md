# 14 — `withTenant` aninhável (P6)

> **ESTADO (2026-08-02):** ✅ implementado — commit `43d6796`.
> ✅ `withTenant` com `existingTx` (reuso em vez de aninhamento).
> ✅ `createCompanyWithOwner` no repositório (atômico: empresa + membro owner
> numa transação só) e `companies.post.ts` refatorado para usá-lo.
> ✅ Testes: `tenant-context.spec.ts` (reuso + persistência até o commit da
> transação externa), integração em `repository.test.ts` (criação atômica +
> rollback se o INSERT do membro falhar), `companies.post.spec.ts` atualizado.

## Contexto

`withTenant` abre `db.transaction` a cada chamada. `db.transaction` **não é
reentrante** — chamar `withTenant` dentro de outro `withTenant` (ou de um callback
de `db.transaction`) quebra. Quando uma operação de negócio precisar de vários
passos atômicos (ex.: criar empresa + criar membro owner + criar invite), cada
método do repositório abriria transações separadas → sem atomicidade.

**Decisão: implementar agora (não adiar).** Design: `withTenant` aceita uma
transação existente e **reusa** em vez de aninhar (o caller decide o commit).

## Alterações

### 1. `server/utils/auth/tenant-context.ts`

```typescript
import { db } from '../db'
import { sql } from 'drizzle-orm'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function withTenant<T>(
  tenantId: string | null,
  userId: string | null,
  fn: (tx: Tx) => Promise<T>,
  existingTx?: Tx,
): Promise<T> {
  const run = async (tx: Tx): Promise<T> => {
    if (tenantId) {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
    }
    if (userId) {
      await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`)
    }
    return await fn(tx)
  }

  if (existingTx) {
    return run(existingTx)
  }

  return db.transaction(run)
}
```

**Por que funciona:**

- `set_config(..., true)` escopa à transação **ativa** — dentro de uma transação
  externa, a variável persiste até o commit/rollback da externa. Reuso é seguro.
- Chamadas sem `existingTx` mantêm o comportamento atual (compatível).
- Caller com transação própria é responsável pelo commit/rollback — `withTenant`
  nunca commita/rollbacka transação que não abriu.

### 2. Novo método composto no repositório (prova do padrão)

Em `server/utils/auth/repository.ts`, adicionar `createCompanyWithOwner` que
demonstra o uso (atomicidade real entre criação + membro owner):

```typescript
async createCompanyWithOwner(
  data: { name: string; cnpj?: string; razaoSocial?: string },
  ownerUserId: string,
): Promise<CompanyResult> {
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(company)
        .values({ name: data.name, cnpj: data.cnpj, razaoSocial: data.razaoSocial })
        .returning()

      await withTenant(created.id, ownerUserId, async (ctxTx) => {
        await ctxTx.insert(companyMember).values({ companyId: created.id, userId: ownerUserId, role: 'owner' })
      }, tx)

      return created!
    })
  } catch (error) {
    return handleDatabaseError(error)
  }
}
```

**Refatorar `companies.post.ts`** para usar `createCompanyWithOwner` (uma única
chamada atômica em vez de `createCompany` + `createCompanyMember`).

**Importante:** com o `existingTx` do tipo `Tx` sendo `Parameters<Parameters<typeof db.transaction>[0]>[0]`, o `tx` do caller e o `ctxTx` têm o mesmo tipo — compila sem `as`/cast.

## Testes

1. `server/utils/auth/tenant-context.spec.ts`:
   - `withTenant(t, u, fn, existingTx)` dentro de `db.transaction` — não lança
     erro de transação aninhada e o contexto fica visível no callback.
   - Contexto setado via `existingTx` persiste até o commit da transação externa.
2. Integração em `repository.test.ts`: `createCompanyWithOwner` cria empresa + owner
   atomicamente; se o INSERT do membro falhar, a empresa NÃO é criada (rollback).
3. `companies.post.spec.ts` continua passando com a refatoração.

## Verificação

```bash
npx vitest run server/utils/auth/tenant-context.spec.ts server/utils/auth/repository.test.ts server/api/auth/companies.post.spec.ts
npm run lint
npm run format:check
npm run dev  # manual: criar empresa via UI/API e conferir owner criado
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).

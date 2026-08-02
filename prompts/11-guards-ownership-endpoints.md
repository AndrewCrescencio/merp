# 11 — Guards de ownership nos endpoints (P3: IDOR)

> **ESTADO (2026-08-02):** ✅ implementado — commit `4327b69`.
> ✅ `getCompanyMembershipRole` — em `repository.ts` (teste de integração em
> `repository.test.ts`).
> ✅ `assertCompanyRole` em `helpers.ts` (`requiredRole: null` = qualquer membro).
> ✅ Guards: `companies.delete.post.ts` owner, `invite.post.ts` owner,
> `invites.get.ts` qualquer membro (regressão: owner continua listando invites),
> `invites.accept.post.ts` email da sessão.
> ✅ Backstop TOCTOU na migration `0009` (aplicada no banco dev via psql).
> ✅ Seção P3 criada em `docs/multi-tenancy/withtenant-rls-review.md`.
>
> **AMENDMENT (2026-08-01, pós-revisão):** este prompt foi ampliado para resolver
> três ressalvas da revisão:
>
> 1. **TOCTOU** — o guard checa a role antes da operação; um owner rebaixado entre
>    o check e o delete completaria a ação. Fix: backstop no RLS (migration `0009` —
>    `company_delete_policy`/`cm_delete_policy` passam a exigir
>    `is_company_owner`), reavaliado no momento da execução. Requer `softDeleteCompany`
>    receber `userId` (contexto de usuário na transação).
> 2. **Helper coexiste com padrão inline** — os endpoints de convite usam check
>    inline (`invite.post.ts`, `invites.get.ts`); passar a usar `assertCompanyRole`
>    (padrão único). O helper precisa suportar check "qualquer membro"
>    (`requiredRole: string | null` — `'member'` exato bloquearia owners de listar
>    invites).
> 3. **Review doc não tem "seção P3"** — a seção será criada na execução (padrão
>    obrigatório de guard documentado).
>
> **AMENDMENT (2026-08-02, pós-execução):** dois desvios do SQL/código proposto,
> necessários para o próprio teste do plano passar (member → 404):
>
> 1. **`company_modify_policy` (UPDATE) também exige owner** — o SQL literal do
>    plano só restringia policies de DELETE, mas `softDeleteCompany` é um
>    **UPDATE** (soft-delete), não um DELETE. Sem o gate no UPDATE, o member
>    completaria o update da company (o tenant context é só isso) e o teste
>    "backstop TOCTOU: member → 404" falharia. A migration `0009` restringe
>    UPDATE/DELETE de `company` e DELETE de `company_member` a
>    `is_company_owner` avaliado no momento da execução.
> 2. **`catch` de `softDeleteCompany` passa H3Error adiante** — o código do
>    plano chamava `sendNotFoundError` (0 rows) mas o catch engolia tudo em
>    `handleDatabaseError` → viraria 503. Adicionado
>    `if (error instanceof H3Error) throw error` (padrão do `acceptInvite`)
>    para o 404 chegar ao cliente.

## Contexto

Os métodos do repositório recebem `companyId` do chamador sem validar que o
usuário tem permissão sobre a empresa. Endpoints tenant-scoped podem operar em
empresas alheias (IDOR — Insecure Direct Object Reference). Exemplos:

- `server/api/auth/companies.delete.post.ts` — hoje usa `isCompanyMember()`; qualquer
  member pode deletar (deveria ser owner).
- `server/api/auth/companies.join.post.ts` — **removido** (self-join aberto não
  existe mais; entrada em empresa agora é exclusivamente via convite:
  `invites.accept.post.ts` — fluxo já implementado e testado).
- `server/api/auth/companies.switch.post.ts` — já valida `isCompanyMember` (OK).

## Alterações

### 1. Repositório: `getCompanyMembershipRole`

Em `server/utils/auth/repository.ts` — adicionar à interface `IAuthRepository` e
implementar:

```typescript
async getCompanyMembershipRole(userId: string, companyId: string): Promise<string | null> {
  try {
    return await withTenant(companyId, userId, async (tx) => {
      const [found] = await tx
        .select({ role: companyMember.role })
        .from(companyMember)
        .where(and(eq(companyMember.userId, userId), eq(companyMember.companyId, companyId)))
        .limit(1)
      return found?.role ?? null
    })
  } catch (error) {
    return handleDatabaseError(error)
  }
}
```

### 2. Helper de guard

Em `server/utils/auth/helpers.ts`:

```typescript
export async function assertCompanyRole(
  role: string | null | undefined,
  requiredRole: string | null, // 'owner' | 'member' | null (qualquer membro)
  notMemberMessage: string,
  wrongRoleMessage?: string,
): Promise<void> {
  if (!role) {
    sendForbiddenError(notMemberMessage)
  }
  if (requiredRole && role !== requiredRole) {
    sendForbiddenError(wrongRoleMessage ?? notMemberMessage)
  }
}
```

- `requiredRole: null` = acesso de **qualquer membro** (owner ou member) — usado por
  `invites.get.ts` (listar invites). `requiredRole: 'member'` exato **bloquearia
  owners** de listar invites — não usar para check de "membro".
- `sendForbiddenError` retorna `never` (lança) — nenhum `return` necessário.

### 3. Endpoint delete — exigir owner

Em `server/api/auth/companies.delete.post.ts`, substitua a verificação
`isCompanyMember` por:

```typescript
const role = await authRepository.getCompanyMembershipRole(user.id, body.companyId)
await assertCompanyRole(
  role,
  'owner',
  'You are not a member of this company',
  'Only company owners can delete companies',
)
```

E o chamado de `softDeleteCompany` passa a receber o `userId` (ver seção 4):

```typescript
await authRepository.softDeleteCompany(body.companyId, user.id)
```

### 4. Backstop RLS contra TOCTOU (migration `0009`)

O guard da seção 3 checa a role **antes** da operação — entre o check e o delete um
owner poderia ser rebaixado (TOCTOU). Resolver no RLS, reavaliado no momento da
execução (migration nova via `npx drizzle-kit generate --custom`):

```sql
-- Delete em company: exige tenant ativo E owner (avaliado na execução)
DROP POLICY company_delete_policy ON company;
CREATE POLICY company_delete_policy ON company FOR DELETE
  USING (id = get_tenant_id() AND is_company_owner(id));

-- Delete em company_member: mesmo requisito (member não remove membros)
DROP POLICY cm_delete_policy ON company_member;
CREATE POLICY cm_delete_policy ON company_member FOR DELETE
  USING (company_id = get_tenant_id() AND is_company_owner(company_id));
```

Em `server/utils/auth/repository.ts`, `softDeleteCompany` passa a receber `userId`
para dar contexto a `is_company_owner` (`get_user_id()`):

```typescript
async softDeleteCompany(companyId: string, userId: string): Promise<CompanyResult> {
  try {
    return await withTenant(companyId, userId, async (tx) => {
      // ATENÇÃO à ordem: update em company ANTES do delete de members —
      // a policy company_delete_policy exige is_company_owner(id) na execução,
      // e o owner ainda é membro neste ponto; deletar members primeiro faria
      // o check falhar (owner removido) → 0 rows → 404 espúrio.
      const [updated] = await tx
        .update(company)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(eq(company.id, companyId))
        .returning()
      if (!updated) {
        sendNotFoundError('Company not found') // RLS negou ou já deletada (0 rows)
      }
      await tx.delete(companyMember).where(eq(companyMember.companyId, companyId))
      return updated!
    })
  } catch (error) {
    return handleDatabaseError(error)
  }
}
```

> **Semântica de RLS em DELETE:** deny = row **ignorada** (0 rows), não erro. Se o
> owner for rebaixado entre guard e delete, o backstop silencia a operação → o
> `if (!updated)` vira 404. O guard continua sendo a resposta normal (403); a
> policy é defesa em profundidade. **Ordem importa:** `company` antes de
> `company_member` — o `is_company_owner` é avaliado no momento do UPDATE/DELETE.

### 5. Unificar padrão nos endpoints de convite

Refatorar os checks inline para o helper (padrão único):

- `server/api/auth/invite.post.ts` (owner): trocar o bloco
  `if (!role) ... / if (role !== 'owner') ...` por:
  ```typescript
  const role = await authRepository.getCompanyMembershipRole(user.id, body.companyId)
  await assertCompanyRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can invite members',
  )
  ```
- `server/api/auth/invites.get.ts` (qualquer membro): trocar o `isCompanyMember`
  por:
  ```typescript
  const role = await authRepository.getCompanyMembershipRole(user.id, query.companyId)
  await assertCompanyRole(role, null, 'You are not a member of this company')
  ```

> `invites.accept.post.ts` não muda (guarda é por email da sessão, não por role).

### 6. Padrão para endpoints futuros

Criar a **seção P3** em `docs/multi-tenancy/withtenant-rls-review.md` (não existe —
criar entre a seção 5 e as Referências, renumerando-as para 7):
**todo endpoint que aceitar `companyId` do cliente DEVE chamar `assertCompanyRole`
antes de qualquer operação** (owner para delete/update/dados sensíveis; `null`
para leitura/switch). As políticas RLS de DELETE exigem owner (backstop TOCTOU) —
o guard dá o erro 403 limpo, o RLS garante a execução.

## Testes

- Atualizar `server/api/auth/companies.delete.post.spec.ts`: mock passa a ser
  `getCompanyMembershipRole` (em vez de `isCompanyMember`) e
  `softDeleteCompany(companyId, userId)`; member tenta deletar → 403; outsider →
  403; owner deleta → sucesso (e `softDeleteCompany` chamado com o `userId`).
- Atualizar `server/api/auth/invite.post.spec.ts` e `server/api/auth/invites.get.spec.ts`:
  mocks passam a `getCompanyMembershipRole` (+ `assertCompanyRole`); regressão:
  **owner continua listando invites** em `invites.get` (check "qualquer membro").
- Integração em `server/utils/auth/repository.test.ts`: `getCompanyMembershipRole`
  (member → `'member'`, owner → `'owner'`, não membro → `null`); `softDeleteCompany`
  com a assinatura nova `(companyId, userId)`; **backstop TOCTOU:** member chama
  `softDeleteCompany(company.id, member.id)` → 404 (RLS negou, 0 rows).
- Spec do guard `assertCompanyRole` em `server/utils/auth/helpers.spec.ts`
  (se não existir, criar): role ausente → 403; role errada → 403; role certa →
  passa; `requiredRole: null` com `'member'` ou `'owner'` → passa.
- SQL da migration `0009` aplicado no banco dev via psql (nota: `drizzle-kit
migrate` falha por causa do 0000 ausente — usar `push` + psql, como no prompt 09).

## Verificação

```bash
npx vitest run server/api/auth/companies.delete.post.spec.ts server/api/auth/invite.post.spec.ts server/api/auth/invites.get.spec.ts server/utils/auth/repository.test.ts server/utils/auth/helpers.spec.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).

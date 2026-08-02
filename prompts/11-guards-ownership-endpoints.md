# 11 — Guards de ownership nos endpoints (P3: IDOR)

> **ESTADO (2026-08-01):** parcialmente implementado.
> ✅ `getCompanyMembershipRole` — já existe em `repository.ts` (com teste de
> integração em `repository.test.ts`).
> ✅ Guards nos endpoints de convite (`invite.post.ts` owner, `invites.get.ts`
> member, `invites.accept.post.ts` email da sessão) — já implementados e testados.
> ❌ `assertCompanyRole` em helpers — pendente.
> ❌ Guard de owner em `companies.delete.post.ts` — pendente (ainda usa
> `isCompanyMember`).

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
  requiredRole: string,
  notMemberMessage: string,
  wrongRoleMessage: string,
): Promise<void> {
  if (!role) {
    sendForbiddenError(notMemberMessage)
  }
  if (role !== requiredRole) {
    sendForbiddenError(wrongRoleMessage)
  }
}
```

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

### 4. Endpoints novos com guard obrigatório

O padrão já aplicado nos endpoints de convite (`invite.post.ts`, `invites.get.ts`,
`invites.accept.post.ts` — implementados): guard de role antes de qualquer
operação tenant-scoped. Qualquer endpoint futuro que aceitar `companyId` deve
seguir o mesmo padrão.

### 5. Padrão para endpoints futuros

Documentar em `docs/multi-tenancy/withtenant-rls-review.md` (seção P3):
**todo endpoint que aceitar `companyId` do cliente DEVE chamar o guard antes de
qualquer operação** (owner para delete/update/dados sensíveis; member para
leitura/switch).

## Testes

- Atualizar `server/api/auth/companies.delete.post.spec.ts`: member tenta deletar →
  403; outsider → 403; owner deleta → sucesso.
- Integração em `server/utils/auth/repository.test.ts`: `getCompanyMembershipRole`
  (member → `'member'`, owner → `'owner'`, não membro → `null`).
- Spec do guard `assertCompanyRole` em `server/utils/auth/helpers.spec.ts`
  (se não existir, criar): role ausente → 403; role errada → 403; role certa →
  passa.

## Verificação

```bash
npx vitest run server/api/auth/companies.delete.post.spec.ts server/utils/auth/repository.test.ts server/utils/auth/helpers.spec.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).

> **ESTADO (2026-08-02):** ⏳ pendente — pendência #6 de `docs/pendencies.md`
> (movido de `prompts/pendencies/14`).

Resolva a pendência #6 de `docs/pendencies.md` — endpoint de remover/leave member.

### Contexto

Não existe endpoint para remover um usuário de uma company nem para um member sair.

### Alterações

1. Em `server/utils/auth/repository.ts` — adicione ao `IAuthRepository` e implemente:

```typescript
removeCompanyMember(companyId: string, userId: string): Promise<void>
```

Use `withTenant(companyId, userId, ...)` com `delete` em `companyMember`.

2. Crie `server/api/auth/companies/members.delete.post.ts` (padrão dos endpoints
   existentes):
   - Body `{ companyId, userId? }` — `companyId` obrigatório (400).
   - **Sem `userId`** (sair da empresa): remove o próprio usuário.
   - **Com `userId`** (remover outro membro): exige `getCompanyMembershipRole` do
     autenticado === `'owner'` (senão 403 'Only company owners can remove members').
   - Não permite remover um membro com role `'owner'` → 403
     'Cannot remove a company owner'. Para o owner sair, deve transferir/deletar a empresa.
   - Membro não encontrado → 404 `not_found`.
   - Registra `auth_event` `member_removed` com metadata `{ companyId, removedUserId }`.

### Testes

- Spec co-localizado `server/api/auth/companies/members.delete.post.spec.ts`: validação,
  403 não-owner, 403 removendo owner, 404, leave próprio com sucesso, remoção com sucesso.
- Caso de integração em `server/utils/auth/repository.test.ts`: remover member remove a
  linha de `companyMember`.

### Verificação

```bash
npx vitest run server/api/auth/companies/members.delete.post.spec.ts server/utils/auth/repository.test.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).

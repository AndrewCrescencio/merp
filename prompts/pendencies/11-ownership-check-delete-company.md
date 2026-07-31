Resolva a pendência crítica #3 de `docs/pendencies.md` — ownership check no soft delete
de company (FR-019).

### Contexto

A spec exige que apenas company owners e super_admin possam deletar, mas
`server/api/auth/companies/delete.post.ts` só verifica `isCompanyMember()`. Qualquer
member pode deletar.

### Alterações

1. Em `server/utils/auth/repository.ts` — adicione ao `IAuthRepository` e implemente:

```typescript
getCompanyMembershipRole(userId: string, companyId: string): Promise<string | null>
```

Use `withTenant(companyId, userId, ...)` (import de `./tenant-context`) para consultar
`companyMember.role`. Retorna `null` se não for membro.

2. Em `server/api/auth/companies/delete.post.ts` — substitua a verificação
   `isCompanyMember` por `getCompanyMembershipRole`:

   - `null` → `sendForbiddenError('You are not a member of this company')`
   - role diferente de `'owner'` → `sendForbiddenError('Only company owners can delete companies')`
   - role `'owner'` → prossegue com `softDeleteCompany`.

### Testes

- Atualize `server/api/auth/companies.delete.post.spec.ts`: caso member tenta deletar →
  403; caso owner deleta → sucesso.
- Adicione caso de integração em `server/utils/auth/repository.test.ts` para
  `getCompanyMembershipRole` (member → `'member'`, owner → `'owner'`, não membro → `null`).

### Verificação

```bash
npx vitest run server/api/auth/companies.delete.post.spec.ts server/utils/auth/repository.test.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).

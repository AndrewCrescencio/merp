> **ESTADO (2026-08-02):** ✅ executado (ver ESTADO abaixo; código no commit
> `7c6d5d5`). Pendência #6 de `docs/pendencies.md`
> (movido de `prompts/pendencies/14`).
> **Desvios (revisão de segurança antes da implementação):**
>
> 1. **RLS impedia o leave** — `cm_delete_policy` (0009) exigia `is_company_owner`
>    para QUALQUER DELETE em `company_member`; um member comum não conseguia
>    deletar a própria linha (0 rows silencioso). Nova migration
>    `drizzle/0010_member_delete_self.sql` estende a policy com self-delete
>    (`user_id = get_user_id() AND role <> 'owner'`), mantendo a cláusula de
>    owner e o backstop TOCTOU. `softDeleteCompany` continua funcionando
>    (owner deleta todas as linhas, incluindo a própria).
> 2. **Assinatura ajustada** — o prompt dizia `removeCompanyMember(companyId, userId)`
>    com `withTenant(companyId, userId)`; o `userId` do target setaria `app.user_id`
>    e o backstop RLS avaliaria a autorização do ALVO (IDOR na policy). Assinatura
>    final: `removeCompanyMember(companyId, executedByUserId, targetUserId)` com
>    `withTenant(companyId, executedByUserId)` — mesmo desvio documentado no
>    prompt 20 (`updateCompany`).
> 3. **Adição: limpeza de `activeCompanyId`** — após remoção/leave, as sessões do
>    usuário removido perdem `activeCompanyId` apontando para a empresa (evita
>    `context.tenantId` stale no middleware). Feito na mesma transação do delete.

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

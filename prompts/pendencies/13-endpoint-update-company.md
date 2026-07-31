Resolva a pendência #5 de `docs/pendencies.md` — endpoint de update de company.

### Contexto

Não existe endpoint para atualizar name, cnpj ou razaoSocial de uma company.

### Alterações

1. Em `server/utils/auth/repository.ts` — adicione ao `IAuthRepository` e implemente:

```typescript
updateCompany(
  companyId: string,
  input: Partial<CreateCompanyInput>,
): Promise<CompanyResult>
```

Use `withTenant(companyId, null, ...)`. Aplique apenas os campos fornecidos
(`name`, `cnpj`, `razaoSocial`), sempre atualize `updatedAt`. Erro `23505` (CNPJ
duplicado) → 409 `conflict` 'CNPJ already registered'. Retorne a company atualizada
(`sendNotFoundError` se o update não retornar linha).

2. Crie `server/api/auth/companies/update.post.ts` seguindo o padrão de
   `companies.delete.post.ts` (auth via `event.context.user`, formato de erro JSON):
   - Body `{ companyId, name?, cnpj?, razaoSocial? }` — `companyId` obrigatório (400).
   - `getCompanyMembershipRole(user.id, companyId)` deve ser `'owner'` (senão 403
     'Only company owners can update companies').
   - Company inexistente → 404 `not_found`.
   - Retorna a company atualizada e registra `auth_event` `company_updated` com metadata
     `{ companyId }`.

### Testes

- Spec co-localizado `server/api/auth/companies/update.post.spec.ts` (mock do repositório):
  validação, 403 não-owner, 404, sucesso.
- Caso de integração em `server/utils/auth/repository.test.ts`: update de name/cnpj,
  CNPJ duplicado → 409.

### Verificação

```bash
npx vitest run server/api/auth/companies/update.post.spec.ts server/utils/auth/repository.test.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).

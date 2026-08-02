# 13 — Teste de isolamento entre tenants (P5)

> **ESTADO (2026-08-02):** ✅ implementado — commit `7de9974`.
> ✅ Bloco `RLS isolation` (visibilidade cross-tenant + busca pública) e
> violações via SQL raw: INSERT cross-tenant, UPDATE de auto-promoção, mover
> membro entre empresas — implementados na execução dos prompts 10/11 com
> asserção mais forte que a do plano (`getPostgresErrorCode === '42501'` em vez
> de `rejects.toThrow()`).
> ✅ Adicionados nesta execução: SELECT fail-closed sem tenant context (0 rows)
> e UPDATE cross-tenant em `company` (0 rows).
> ⚠️ A dependência de ordem (09+10 antes) está satisfeita.
>
> **AMENDMENT (2026-08-02, pós-execução):** o teste de SELECT cross-tenant com
> tenant context arbitrário (rascunho do plano) **não falha** — e isso é design:
> `cm_select_policy` permite leitura por `company_id = get_tenant_id()` e o
> tenant context é fornecido pelo app, nunca pelo atacante. O isolamento de
> leitura vem do guard do app (P3) + fail-closed sem contexto — o teste cobre o
> caminho fail-closed; o caminho "contexto arbitrário" é responsabilidade do
> endpoint (guard).

## Contexto

Não existe teste provando que um usuário da empresa A não consegue ler nem
modificar dados da empresa B. Os prompts 09 e 10 mudam o RLS (FORCE + policy de
INSERT) — este teste é a prova de que o isolamento funciona de verdade com DB real.

## Alterações

Em `server/utils/auth/repository.test.ts`, estender/garantir o bloco `RLS isolation`
(criar se não existir). O setup dos prompts anteriores já cria fixtures — usar o
mesmo padrão (`repo.register`, `repo.createCompany`, `repo.createCompanyMember`):

```typescript
describe('RLS isolation', () => {
  let userA: UserResult
  let userB: UserResult
  let companyA: CompanyResult
  let companyB: CompanyResult

  beforeEach(async () => {
    const suffix = Date.now().toString(36)
    userA = await repo.register({
      email: `tenant-a-${suffix}@example.com`,
      password: 'password123',
      name: 'User A',
    })
    userB = await repo.register({
      email: `tenant-b-${suffix}@example.com`,
      password: 'password123',
      name: 'User B',
    })
    companyA = await repo.createCompany({ name: 'Company A' })
    companyB = await repo.createCompany({ name: 'Company B' })
    await repo.createCompanyMember(companyA.id, userA.id, 'owner')
    await repo.createCompanyMember(companyB.id, userB.id, 'owner')
  })

  it('prevents cross-tenant member visibility', async () => {
    const userACompanies = await repo.findUserCompanies(userA.id)
    expect(userACompanies).toHaveLength(1)
    expect(userACompanies[0].id).toBe(companyA.id)
  })

  it('prevents cross-tenant INSERT via raw SQL (policy check)', async () => {
    await expect(
      withTenant(companyB.id, userA.id, async (tx) => {
        await tx
          .insert(companyMember)
          .values({ companyId: companyB.id, userId: userA.id, role: 'owner' })
      }),
    ).rejects.toThrow()
  })

  it('prevents member self-promotion to owner via UPDATE', async () => {
    await repo.createCompanyMember(companyA.id, userB.id, 'member')
    await expect(
      withTenant(companyA.id, userB.id, async (tx) => {
        await tx
          .update(companyMember)
          .set({ role: 'owner' })
          .where(and(eq(companyMember.companyId, companyA.id), eq(companyMember.userId, userB.id)))
      }),
    ).rejects.toThrow()
  })

  it('allows company search without tenant context', async () => {
    const result = await repo.searchCompanies('Company')
    expect(result.length).toBeGreaterThanOrEqual(2)
  })
})
```

**Notas:**

- Usar `withTenant` direto nos testes de violação (SQL raw) para garantir que é o
  **RLS** bloqueando, não um guard do app.
- Se o erro for esperado como 0 rows em vez de throw em algum ambiente, ajustar a
  asserção (o importante é NÃO inserir/alterar).
- Testes com DB real → arquivo `.test.ts`, nunca `.spec.ts`.

## Verificação

```bash
npx vitest run server/utils/auth/repository.test.ts
npm run lint
npm run format:check
```

Se tudo passar, faça commit com a convenção da AGENTS.md (corpo com `Model:` e `Agent:`).

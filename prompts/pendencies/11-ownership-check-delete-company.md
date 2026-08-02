# 11 — Ownership check no delete de company (FR-019)

> **SUPERSEDIDO** — este prompt foi absorvido e generalizado em
> `prompts/11-guards-ownership-endpoints.md` (guards `getCompanyMembershipRole` +
> `assertCompanyRole` aplicados a TODOS os endpoints tenant-scoped, não só delete).
> Execute o prompt raiz e marque esta pendência como resolvida.

## Contexto (histórico)

A spec exige que apenas company owners e super_admin possam deletar, mas
`server/api/auth/companies/delete.post.ts` só verificava `isCompanyMember()`. Qualquer
member podia deletar.

A solução original (preservada no prompt raiz):

1. `getCompanyMembershipRole(userId, companyId): Promise<string | null>` em
   `server/utils/auth/repository.ts` (com `withTenant(companyId, userId, ...)`).
2. Endpoint delete: role `null` → 403; role ≠ `'owner'` → 403; owner → prossegue.

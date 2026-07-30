Modifique `server/utils/auth/repository.ts`:

### 6.1 Adicionar import

No topo do arquivo, adicione:

```typescript
import { withTenant } from './tenant-context'
```

### 6.2 Substituir métodos para usar `withTenant`

**Método `findUserCompanies`** — substitua o corpo por:

```typescript
async findUserCompanies(userId: string): Promise<Array<CompanyResult & { role: string }>> {
  try {
    return await withTenant(null, userId, async (tx) => {
      return await tx
        .select({
          id: company.id,
          name: company.name,
          cnpj: company.cnpj,
          razaoSocial: company.razaoSocial,
          isDeleted: company.isDeleted,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
          role: companyMember.role,
        })
        .from(companyMember)
        .innerJoin(company, eq(companyMember.companyId, company.id))
        .where(and(eq(companyMember.userId, userId), eq(company.isDeleted, false)))
    })
  } catch (error) {
    return handleDatabaseError(error)
  }
}
```

**Método `isCompanyMember`** — substitua o corpo por:

```typescript
async isCompanyMember(userId: string, companyId: string): Promise<boolean> {
  try {
    return await withTenant(companyId, userId, async (tx) => {
      const [found] = await tx
        .select({ id: companyMember.id })
        .from(companyMember)
        .where(and(eq(companyMember.userId, userId), eq(companyMember.companyId, companyId)))
        .limit(1)
      return !!found
    })
  } catch (error) {
    return handleDatabaseError(error)
  }
}
```

**Método `createCompanyMember`** — substitua o corpo por:

```typescript
async createCompanyMember(
  companyId: string,
  userId: string,
  role = 'member',
): Promise<CompanyMemberResult> {
  try {
    return await withTenant(companyId, userId, async (tx) => {
      const [created] = await tx
        .insert(companyMember)
        .values({ companyId, userId, role })
        .returning()
      return created!
    })
  } catch (error: any) {
    if (error?.code === '23505') {
      throw createError({
        status: 409,
        statusText: '409',
        message: JSON.stringify({
          error: 'conflict',
          message: 'User is already a member of this company',
        }),
      })
    }
    return handleDatabaseError(error)
  }
}
```

**Método `setActiveCompany`** — substitua o corpo por:

```typescript
async setActiveCompany(sessionId: string, companyId: string | null): Promise<void> {
  try {
    await withTenant(companyId, null, async (tx) => {
      await tx
        .update(session)
        .set({ activeCompanyId: companyId, updatedAt: new Date() })
        .where(eq(session.id, sessionId))
    })
  } catch (error) {
    return handleDatabaseError(error)
  }
}
```

**Método `softDeleteCompany`** — substitua o corpo por:

```typescript
async softDeleteCompany(companyId: string): Promise<CompanyResult> {
  try {
    return await withTenant(companyId, null, async (tx) => {
      await tx.delete(companyMember).where(eq(companyMember.companyId, companyId))
      const [updated] = await tx
        .update(company)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(eq(company.id, companyId))
        .returning()
      return updated!
    })
  } catch (error) {
    return handleDatabaseError(error)
  }
}
```

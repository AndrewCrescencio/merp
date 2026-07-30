### 7.1 Criar teste unitário do `withTenant`

Crie o arquivo `server/utils/auth/tenant-context.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { db } from '../db'
import { sql } from 'drizzle-orm'

describe('withTenant', () => {
  it('sets app.tenant_id within transaction', async () => {
    const { withTenant } = await import('./tenant-context')

    const result = await withTenant('test-tenant-id', 'test-user-id', async (tx) => {
      const [row] = await tx.execute(sql`
        SELECT current_setting('app.tenant_id', true) AS tenant_id,
               current_setting('app.user_id', true) AS user_id
      `)
      return row as { tenant_id: string; user_id: string }
    })

    expect(result.tenant_id).toBe('test-tenant-id')
    expect(result.user_id).toBe('test-user-id')
  })

  it('clears context after transaction ends', async () => {
    const { withTenant } = await import('./tenant-context')

    await withTenant('temp-tenant', 'temp-user', async (_tx) => {
      // context is set inside
    })

    const [row] = await db.execute(sql`
      SELECT current_setting('app.tenant_id', true) AS tenant_id
    `)
    expect((row as any).tenant_id).toBe('')
  })
})
```

### 7.2 Adicionar teste de isolamento RLS

No fim do arquivo `server/utils/auth/repository.test.ts`, adicione:

```typescript
describe('RLS isolation', () => {
  it('prevents cross-tenant member visibility', async () => {
    const emailA = `tenant-a-${Date.now()}@example.com`
    const emailB = `tenant-b-${Date.now()}@example.com`

    const userA = await repo.register({ email: emailA, password: 'password123', name: 'User A' })
    const userB = await repo.register({ email: emailB, password: 'password123', name: 'User B' })

    const companyA = await repo.createCompany({ name: 'Company A' })
    const companyB = await repo.createCompany({ name: 'Company B' })

    await repo.createCompanyMember(companyA.id, userA.id, 'owner')
    await repo.createCompanyMember(companyB.id, userB.id, 'owner')

    const userACompanies = await repo.findUserCompanies(userA.id)
    expect(userACompanies).toHaveLength(1)
    expect(userACompanies[0].id).toBe(companyA.id)

    const userBCompanies = await repo.findUserCompanies(userB.id)
    expect(userBCompanies).toHaveLength(1)
    expect(userBCompanies[0].id).toBe(companyB.id)
  })

  it('allows company search without tenant context', async () => {
    const result = await repo.searchCompanies('Company')
    expect(result.length).toBeGreaterThanOrEqual(2)
  })
})
```

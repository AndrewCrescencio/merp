import { describe, it, expect } from 'vitest'
import { db, createOwnerDbForSetupOnly } from './db'
import { sql } from 'drizzle-orm'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('Tenant isolation under concurrent load', () => {
  const ownerDb = createOwnerDbForSetupOnly()
  const TENANT_A = '11111111-1111-1111-1111-111111111111'
  const TENANT_B = '22222222-2222-2222-2222-222222222222'
  const USER_A = '33333333-3333-3333-3333-333333333333'
  const USER_B = '44444444-4444-4444-4444-444444444444'

  beforeAll(async () => {
    await ownerDb.transaction(async (tx) => {
      await tx.execute(
        sql`INSERT INTO company (id, name) VALUES (${TENANT_A}, 'Tenant A') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO company (id, name) VALUES (${TENANT_B}, 'Tenant B') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO "user" (id, email, name) VALUES (${USER_A}, 'usera@test.com', 'User A') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO "user" (id, email, name) VALUES (${USER_B}, 'userb@test.com', 'User B') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(sql`
        INSERT INTO company_member (company_id, user_id, role)
        VALUES (${TENANT_A}, ${USER_A}, 'member')
        ON CONFLICT DO NOTHING
      `)
      await tx.execute(sql`
        INSERT INTO company_member (company_id, user_id, role)
        VALUES (${TENANT_B}, ${USER_B}, 'member')
        ON CONFLICT DO NOTHING
      `)
    })
  })

  it('20 concurrent operations: 10 per tenant, zero cross-tenant leakage', async () => {
    const iterations = 100
    const concurrency = 20

    for (let iter = 0; iter < iterations; iter++) {
      const promises: Promise<void>[] = []

      for (let i = 0; i < concurrency; i++) {
        const isTenantA = i < 10
        const tenantId = isTenantA ? TENANT_A : TENANT_B
        const userId = isTenantA ? USER_A : USER_B

        promises.push(
          db.transaction(async (tx) => {
            await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
            await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`)

            // Insert a row for this tenant
            const id = `${tenantId.replace(/-/g, '').slice(0, 8)}${iter.toString().padStart(4, '0')}${i.toString().padStart(2, '0')}`
            await tx.execute(sql`
              INSERT INTO company (id, name) VALUES (${id}, ${`Test ${tenantId} ${iter}-${i}`})
              ON CONFLICT DO NOTHING
            `)

            // Verify only this tenant's rows are visible
            const [countRow] = await tx.execute(
              sql`SELECT COUNT(*) FROM company WHERE id LIKE ${`${tenantId.replace(/-/g, '').slice(0, 8)}%`}`,
            )
            const ownCount = Number((countRow as any).count)

            const [otherCountRow] = await tx.execute(
              sql`SELECT COUNT(*) FROM company WHERE id LIKE ${`${(isTenantA ? TENANT_B : TENANT_A).replace(/-/g, '').slice(0, 8)}%`}`,
            )
            const otherCount = Number((otherCountRow as any).count)

            if (otherCount > 0) {
              throw new Error(
                `CROSS-TENANT LEAK: tenant ${tenantId} sees ${otherCount} rows from other tenant`,
              )
            }
          }),
        )
      }

      await Promise.all(promises)
    }
  })

  it('100 iterations: rapid tenant switching in same connection pool', async () => {
    const iterations = 100
    const seenOtherTenant: string[] = []

    for (let i = 0; i < iterations; i++) {
      // Alternate between tenants rapidly
      const tenantId = i % 2 === 0 ? TENANT_A : TENANT_B
      const userId = i % 2 === 0 ? USER_A : USER_B
      const otherTenantId = i % 2 === 0 ? TENANT_B : TENANT_A

      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
        await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`)

        const [row] = await tx.execute(
          sql`SELECT COUNT(*) FROM company WHERE id LIKE ${`${otherTenantId.replace(/-/g, '').slice(0, 8)}%`}`,
        )
        const count = Number((row as any).count)

        if (count > 0) {
          seenOtherTenant.push(
            `iteration ${i}: tenant ${tenantId} saw ${count} rows from ${otherTenantId}`,
          )
        }
      })
    }

    expect(seenOtherTenant).toHaveLength(0)
  })
})

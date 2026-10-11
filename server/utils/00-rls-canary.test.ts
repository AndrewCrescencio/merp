import { describe, it } from 'vitest'
import { db, createOwnerDbForSetupOnly } from './db'
import { sql } from 'drizzle-orm'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('RLS Canary — MUST fail if suite runs as owner/superuser', () => {
  const ownerDb = createOwnerDbForSetupOnly()

  it('prevents cross-tenant read: tenant A cannot read tenant B data', async () => {
    const companyA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const companyB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const userA = 'uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu'

    // Setup: create two companies and a user member of company A only (as owner, bypasses RLS)
    await ownerDb.transaction(async (tx) => {
      await tx.execute(
        sql`INSERT INTO company (id, name) VALUES (${companyA}, 'Company A') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO company (id, name) VALUES (${companyB}, 'Company B') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO "user" (id, email, name) VALUES (${userA}, 'userA@test.com', 'User A') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(sql`
        INSERT INTO company_member (company_id, user_id, role)
        VALUES (${companyA}, ${userA}, 'member')
        ON CONFLICT DO NOTHING
      `)
    })

    // ACT: connect as merp_app (RLS enforced), set tenant to company A
    // Try to read company B — MUST return 0 rows
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${companyA}, true)`)
      await tx.execute(sql`SELECT set_config('app.user_id', ${userA}, true)`)

      const [row] = await tx.execute(sql`SELECT * FROM company WHERE id = ${companyB}`)
      return row
    })

    // ASSERT: RLS must block cross-tenant access
    if (result !== undefined) {
      throw new Error('RLS BYPASS DETECTED — suite is running as owner/superuser')
    }
  })

  it('prevents cross-tenant read via company_member table', async () => {
    const companyA = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const companyB = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const userA = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

    await ownerDb.transaction(async (tx) => {
      await tx.execute(
        sql`INSERT INTO company (id, name) VALUES (${companyA}, 'Company C') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO company (id, name) VALUES (${companyB}, 'Company D') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(
        sql`INSERT INTO "user" (id, email, name) VALUES (${userA}, 'userB@test.com', 'User B') ON CONFLICT DO NOTHING`,
      )
      await tx.execute(sql`
        INSERT INTO company_member (company_id, user_id, role)
        VALUES (${companyA}, ${userA}, 'member')
        ON CONFLICT DO NOTHING
      `)
    })

    // Set tenant to company A, try to read company_member rows for company B
    const count = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${companyA}, true)`)
      await tx.execute(sql`SELECT set_config('app.user_id', ${userA}, true)`)

      const [row] = await tx.execute(
        sql`SELECT COUNT(*) FROM company_member WHERE company_id = ${companyB}`,
      )
      return Number((row as any).count)
    })

    if (count > 0) {
      throw new Error('RLS BYPASS DETECTED — suite is running as owner/superuser')
    }
  })
})

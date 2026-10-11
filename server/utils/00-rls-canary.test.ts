import { describe, it } from 'vitest'
import { db, createOwnerDbForSetupOnly } from './db'
import { sql } from 'drizzle-orm'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('RLS Canary — MUST fail if suite runs as owner/superuser', () => {
  const ownerDb = createOwnerDbForSetupOnly()

  // As seeds usam ids fixos, mas o email tem índice unique: uma execução
  // anterior com outro id deixava a linha órfã, o ON CONFLICT DO NOTHING
  // mascarava o conflito e o INSERT seguinte estourava no FK de
  // company_member. Limpa antes de semear para o teste ser hermético.
  async function seedTenant(
    companyIds: [string, string],
    companyNames: [string, string],
    userId: string,
    userEmail: string,
  ) {
    const [companyA, companyB] = companyIds
    await ownerDb.transaction(async (tx) => {
      await tx.execute(sql`
        DELETE FROM company_member
        WHERE user_id = ${userId}
           OR user_id IN (SELECT id FROM "user" WHERE email = ${userEmail})
      `)
      await tx.execute(sql`DELETE FROM "user" WHERE id = ${userId} OR email = ${userEmail}`)
      await tx.execute(sql`DELETE FROM company WHERE id = ${companyA}`)
      await tx.execute(sql`DELETE FROM company WHERE id = ${companyB}`)

      await tx.execute(sql`INSERT INTO company (id, name) VALUES (${companyA}, ${companyNames[0]})`)
      await tx.execute(sql`INSERT INTO company (id, name) VALUES (${companyB}, ${companyNames[1]})`)
      await tx.execute(
        sql`INSERT INTO "user" (id, email, name) VALUES (${userId}, ${userEmail}, 'User')`,
      )
      await tx.execute(sql`
        INSERT INTO company_member (company_id, user_id, role)
        VALUES (${companyA}, ${userId}, 'member')
      `)
    })
  }

  it('prevents cross-tenant read: tenant A cannot read tenant B data', async () => {
    const companyA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const companyB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const userA = 'uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu'

    // Setup (as owner, bypasses RLS): two companies and a member of A only.
    await seedTenant([companyA, companyB], ['Company A', 'Company B'], userA, 'userA@test.com')

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

    await seedTenant([companyA, companyB], ['Company C', 'Company D'], userA, 'userB@test.com')

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

import { describe, it, expect } from 'vitest'
import { db } from '../db'
import { sql } from 'drizzle-orm'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('withTenant (integration)', () => {
  const context = (companyId: string | null, locationId: string | null, userId: string | null) => ({
    companyId,
    locationId,
    userId,
  })

  async function currentScope(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
    const [row] = await tx.execute(sql`
      SELECT NULLIF(current_setting('app.tenant_id', true), '') AS "companyId",
             NULLIF(current_setting('app.location_id', true), '') AS "locationId",
             NULLIF(current_setting('app.user_id', true), '') AS "userId"
    `)
    return row as { companyId: string | null; locationId: string | null; userId: string | null }
  }

  it('sets company, location, and user scope in the owned transaction', async () => {
    const { withTenant } = await import('./tenant-context')

    const result = await withTenant(context('test-company', 'test-location', 'test-user'), (tx) =>
      currentScope(tx),
    )

    expect(result).toEqual(context('test-company', 'test-location', 'test-user'))
  })

  it('clears explicit null scope and clears local settings after commit', async () => {
    const { withTenant } = await import('./tenant-context')

    const scoped = await withTenant(context(null, null, null), (tx) => currentScope(tx))
    expect(scoped).toEqual(context(null, null, null))

    const [row] = await db.execute(sql`
      SELECT NULLIF(current_setting('app.tenant_id', true), '') AS "companyId",
             NULLIF(current_setting('app.location_id', true), '') AS "locationId",
             NULLIF(current_setting('app.user_id', true), '') AS "userId"
    `)
    expect(row).toEqual(context(null, null, null))
  })

  it('nested calls inherit caller scope and leave it unchanged after return', async () => {
    const { withTenant } = await import('./tenant-context')

    await withTenant(context('outer-company', 'outer-location', 'outer-user'), async (rootTx) => {
      const before = await currentScope(rootTx)
      const nested = await withTenant(
        context('ignored-company', 'ignored-location', 'ignored-user'),
        currentScope,
        { transaction: rootTx },
      )
      const after = await currentScope(rootTx)

      expect(nested).toEqual(before)
      expect(after).toEqual(before)
    })
  })

  it('temporarily switches scope, supports null, then restores caller scope', async () => {
    const { withTenant } = await import('./tenant-context')

    await withTenant(context('outer-company', 'outer-location', 'outer-user'), async (tx) => {
      const inner = await withTenant(context(null, null, null), currentScope, {
        transaction: tx,
        scope: 'temporary',
      })

      expect(inner).toEqual(context(null, null, null))
      expect(await currentScope(tx)).toEqual(
        context('outer-company', 'outer-location', 'outer-user'),
      )
    })
  })

  it('keeps an explicit transition active until the owning transaction commits', async () => {
    const { withTenant } = await import('./tenant-context')

    await withTenant(context(null, null, 'founder'), async (tx) => {
      await withTenant(
        context('new-company', null, 'founder'),
        async (transitionTx) =>
          expect(await currentScope(transitionTx)).toEqual(context('new-company', null, 'founder')),
        { transaction: tx, scope: 'transition' },
      )
      expect(await currentScope(tx)).toEqual(context('new-company', null, 'founder'))
    })
  })

  it('rolls back a failed nested scope change to a savepoint and keeps the caller tx usable', async () => {
    const { withTenant } = await import('./tenant-context')

    await withTenant(context('outer-company', null, 'outer-user'), async (tx) => {
      await expect(
        withTenant(
          context('inner-company', null, 'inner-user'),
          async () => {
            throw new Error('operation failed')
          },
          { transaction: tx, scope: 'transition' },
        ),
      ).rejects.toThrow('operation failed')

      expect(await currentScope(tx)).toEqual(context('outer-company', null, 'outer-user'))
      const [row] = await tx.execute(sql`SELECT 42 AS value`)
      expect(row).toMatchObject({ value: 42 })
    })
  })

  it('isolates simultaneous scopes on separate pooled transactions', async () => {
    const { withTenant } = await import('./tenant-context')

    const scopes = await Promise.all(
      ['pool-company-a', 'pool-company-b'].map((companyId) =>
        withTenant(context(companyId, null, companyId), async (tx) => {
          await tx.execute(sql`SELECT pg_sleep(0.05)`)
          return currentScope(tx)
        }),
      ),
    )

    expect(scopes).toEqual([
      context('pool-company-a', null, 'pool-company-a'),
      context('pool-company-b', null, 'pool-company-b'),
    ])
  })
})

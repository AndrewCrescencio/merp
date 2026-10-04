import { describe, it, expect } from 'vitest'
import { db } from '../db'
import { sql } from 'drizzle-orm'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

describe.skipIf(!dbAvailable)('withTenant (integration)', () => {
  it('sets app.tenant_id and app.location_id within transaction', async () => {
    const { withTenant } = await import('./tenant-context')

    const result = await withTenant(
      'test-tenant-id',
      'test-location-id',
      'test-user-id',
      async (tx) => {
        const [row] = await tx.execute(sql`
        SELECT current_setting('app.tenant_id', true) AS tenant_id,
               current_setting('app.location_id', true) AS location_id,
               current_setting('app.user_id', true) AS user_id
      `)
        return row as { tenant_id: string; location_id: string; user_id: string }
      },
    )

    expect(result.tenant_id).toBe('test-tenant-id')
    expect(result.location_id).toBe('test-location-id')
    expect(result.user_id).toBe('test-user-id')
  })

  it('clears context after transaction ends', async () => {
    const { withTenant } = await import('./tenant-context')

    await withTenant('temp-tenant', null, 'temp-user', async (_tx) => {
      // context is set inside
    })

    const [row] = await db.execute(sql`
      SELECT current_setting('app.tenant_id', true) AS tenant_id
    `)
    // Fail-closed: fora da transação o GUC volta a ausente (NULL) ou vazio
    // ('') — ambos mapeiam para NULL via NULLIF no get_tenant_id() → RLS nega.
    expect([null, '']).toContain((row as any).tenant_id)
  })

  it('reuses an existing transaction when existingTx is passed', async () => {
    const { withTenant } = await import('./tenant-context')

    const result = await db.transaction(async (tx) => {
      return await withTenant(
        'outer-tenant',
        'outer-location',
        'outer-user',
        async (ctxTx) => {
          const [row] = await ctxTx.execute(sql`
            SELECT current_setting('app.tenant_id', true) AS tenant_id,
                   current_setting('app.location_id', true) AS location_id,
                   current_setting('app.user_id', true) AS user_id
          `)
          return row as { tenant_id: string; location_id: string; user_id: string }
        },
        tx,
      )
    })

    expect(result.tenant_id).toBe('outer-tenant')
    expect(result.location_id).toBe('outer-location')
    expect(result.user_id).toBe('outer-user')
  })

  it('context set via existingTx persists until the outer transaction commits', async () => {
    const { withTenant } = await import('./tenant-context')

    await db.transaction(async (tx) => {
      await withTenant(
        'persist-tenant',
        'persist-location',
        null,
        async (ctxTx) => {
          await ctxTx.execute(sql`SELECT 1`)
        },
        tx,
      )

      const [row] = await tx.execute(sql`
        SELECT current_setting('app.tenant_id', true) AS tenant_id
      `)
      expect((row as { tenant_id: string }).tenant_id).toBe('persist-tenant')
    })

    const [row] = await db.execute(sql`
      SELECT current_setting('app.tenant_id', true) AS tenant_id
    `)
    expect([null, '']).toContain((row as any).tenant_id)
  })

  it('clears outer tenant when nested withTenant(null) reuses the transaction', async () => {
    const { withTenant } = await import('./tenant-context')

    await db.transaction(async (tx) => {
      await withTenant('outer-tenant', 'outer-location', 'outer-user', async () => {}, tx)

      await withTenant(
        null,
        'other-location',
        'other-user',
        async (ctxTx) => {
          const [row] = await ctxTx.execute(sql`
            SELECT current_setting('app.tenant_id', true) AS tenant_id,
                   current_setting('app.location_id', true) AS location_id,
                   current_setting('app.user_id', true) AS user_id
          `)
          const r = row as {
            tenant_id: string | null
            location_id: string | null
            user_id: string | null
          }
          expect([null, '']).toContain(r.tenant_id)
          expect(r.location_id).toBe('other-location')
          expect(r.user_id).toBe('other-user')
        },
        tx,
      )
    })
  })
})

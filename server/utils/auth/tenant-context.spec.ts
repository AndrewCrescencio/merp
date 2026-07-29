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

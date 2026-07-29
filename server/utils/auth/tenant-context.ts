import { db } from '../db'
import { sql } from 'drizzle-orm'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function withTenant<T>(
  tenantId: string | null,
  userId: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    if (tenantId) {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
    }
    if (userId) {
      await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`)
    }
    return await fn(tx)
  })
}

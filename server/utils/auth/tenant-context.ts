import { db } from '../db'
import { sql } from 'drizzle-orm'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function withTenant<T>(
  tenantId: string | null,
  userId: string | null,
  fn: (tx: Tx) => Promise<T>,
  existingTx?: Tx,
): Promise<T> {
  const run = async (tx: Tx): Promise<T> => {
    // Fail-closed em reuso aninhado: NULL limpa o GUC ('') em vez de herdar
    // o valor externo — NULLIF(get_*(), '') → NULL → RLS nega.
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId ?? ''}, true)`)
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId ?? ''}, true)`)
    return await fn(tx)
  }

  if (existingTx) {
    return run(existingTx)
  }

  return db.transaction(run)
}

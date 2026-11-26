import { db } from '../db'
import { sql } from 'drizzle-orm'

export type TenantTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Scope consumed by the PostgreSQL RLS policies. Null is an explicit empty scope. */
export interface TenantScope {
  companyId: string | null
  locationId: string | null
  userId: string | null
}

export interface TenantScopeOptions {
  /** Existing transaction owned by the caller. */
  transaction: TenantTransaction
  /**
   * `inherit` keeps the caller's scope; `temporary` restores it after the
   * callback; `transition` deliberately leaves the new scope active until the
   * caller's transaction ends.
   */
  scope?: 'inherit' | 'temporary' | 'transition'
}

const readScope = async (tx: TenantTransaction): Promise<TenantScope> => {
  const [row] = await tx.execute(sql`
    SELECT NULLIF(current_setting('app.tenant_id', true), '') AS "companyId",
           NULLIF(current_setting('app.location_id', true), '') AS "locationId",
           NULLIF(current_setting('app.user_id', true), '') AS "userId"
  `)
  return row as TenantScope
}

async function setScope(tx: TenantTransaction, context: TenantScope): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.tenant_id', ${context.companyId ?? ''}, true)`)
  await tx.execute(sql`SELECT set_config('app.location_id', ${context.locationId ?? ''}, true)`)
  await tx.execute(sql`SELECT set_config('app.user_id', ${context.userId ?? ''}, true)`)
}

/**
 * Entry point for RLS-scoped queries. Without an existing transaction this
 * owns one and initializes all three GUCs. Nested calls inherit the caller's
 * scope by default. Use `temporary` for a bounded scope change or `transition`
 * when later work in the same transaction must keep the new scope.
 *
 * Nested calls use savepoints so a failed repository operation can be caught
 * without leaving the caller's transaction aborted. A temporary scope change
 * restores the caller's values before the savepoint is released.
 */
export async function withTenant<T>(
  context: TenantScope,
  fn: (tx: TenantTransaction) => Promise<T>,
  options?: TenantScopeOptions,
): Promise<T> {
  if (!options) {
    return db.transaction(async (tx) => {
      await setScope(tx, context)
      return await fn(tx)
    })
  }

  const { transaction, scope = 'inherit' } = options
  if (scope === 'inherit') {
    return await transaction.transaction(async (nestedTx) => await fn(nestedTx))
  }

  return await transaction.transaction(async (nestedTx) => {
    const previous = scope === 'temporary' ? await readScope(nestedTx) : null
    await setScope(nestedTx, context)
    const result = await fn(nestedTx)
    if (previous) await setScope(nestedTx, previous)
    return result
  })
}

#!/usr/bin/env tsx
// Smoke test agnóstico ao driver: roda contra o `db` real
// (server/utils/db.ts, que respeita DB_DRIVER + APP_DATABASE_URL).
// Sem banco acessível → falha de conexão logo cedo, com erro claro do driver.
import { db } from '../server/utils/db'
import { sql } from 'drizzle-orm'
import { withTenant } from '../server/utils/db/tenant-context'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

async function main(): Promise<void> {
  const USER = 'smoke_user'
  // id da company = o próprio tenant (policy company_select: id = get_tenant_id())
  const TENANT_A = `smoke_a_${crypto.randomUUID().replace(/-/g, '')}`
  const TENANT_B = `smoke_b_${crypto.randomUUID().replace(/-/g, '')}`

  // (a) current_user = merp_app, sem superuser e sem BYPASSRLS
  const [me] = await db.execute(sql`
    SELECT current_user AS user,
           (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser,
           (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls
  `)
  assert(String(me.user) === 'merp_app', `current_user inesperado: ${me.user}`)
  assert(me.superuser === false, 'merp_app não pode ser superuser')
  assert(me.bypassrls === false, 'merp_app não pode ter BYPASSRLS')
  console.log('✓ (a) current_user = merp_app, sem superuser e sem BYPASSRLS')

  // (b) GUC só dentro da transação; não persiste fora dela
  await withTenant(TENANT_A, null, USER, async (tx) => {
    const [row] = await tx.execute(sql`SELECT current_setting('app.tenant_id', true) AS tenant_id`)
    assert(String(row.tenant_id) === TENANT_A, 'GUC não definido dentro da transação')
  })
  const [after] = await db.execute(sql`SELECT current_setting('app.tenant_id', true) AS tenant_id`)
  assert(after.tenant_id === null || after.tenant_id === '', 'GUC vazou fora da transação')
  console.log('✓ (b) GUC definido dentro da transação e não persiste fora dela')

  // (c) duas transações concorrentes (A e B) não se enxergam
  await Promise.all([
    withTenant(TENANT_A, null, USER, async (tx) => {
      await tx.execute(
        sql`INSERT INTO company (id, name) VALUES (${TENANT_A}, 'Smoke A') ON CONFLICT DO NOTHING`,
      )
      const [row] = await tx.execute(sql`SELECT COUNT(*) AS n FROM company WHERE id = ${TENANT_A}`)
      assert(Number(row.n) >= 1, 'tenant A não vê a própria linha')
      const [other] = await tx.execute(
        sql`SELECT COUNT(*) AS n FROM company WHERE id = ${TENANT_B}`,
      )
      assert(Number(other.n) === 0, 'tenant A viu linha do tenant B')
    }),
    withTenant(TENANT_B, null, USER, async (tx) => {
      await tx.execute(
        sql`INSERT INTO company (id, name) VALUES (${TENANT_B}, 'Smoke B') ON CONFLICT DO NOTHING`,
      )
      const [row] = await tx.execute(sql`SELECT COUNT(*) AS n FROM company WHERE id = ${TENANT_B}`)
      assert(Number(row.n) >= 1, 'tenant B não vê a própria linha')
      const [other] = await tx.execute(
        sql`SELECT COUNT(*) AS n FROM company WHERE id = ${TENANT_A}`,
      )
      assert(Number(other.n) === 0, 'tenant B viu linha do tenant A')
    }),
  ])
  console.log('✓ (c) transações concorrentes com tenants A e B isoladas')

  // (d) tabela com RLS, sem tenant definido, devolve zero linhas (fail-closed)
  const [countRow] = await db.execute(sql`SELECT COUNT(*) AS n FROM company`)
  assert(Number(countRow.n) === 0, `sem GUC devia devolver 0 linhas, obteve ${countRow.n}`)
  console.log('✓ (d) sem tenant definido → 0 linhas')

  // Fecha o pool (senão conexões ociosas deixam o processo travado).
  const client = (db as { $client?: { end: () => Promise<unknown> } }).$client
  if (client?.end) await client.end()

  console.log('✓ db-smoke: todas as verificações passaram')
}

main().catch((error) => {
  console.error('✗ db-smoke falhou:', error instanceof Error ? error.message : error)
  process.exit(1)
})

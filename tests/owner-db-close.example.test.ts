import { afterAll, describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { createOwnerDbForSetupOnly } from './support/owner-db'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

// Exemplo de uso do owner-db com fechamento explícito do pool.
// O caller é responsável por chamar close() em afterAll/afterEach: sem isto
// o pool postgres() fica aberto, vaza conexões e o processo pode não terminar
// limpo (warning de pool aberto).
describe.skipIf(!dbAvailable)('owner-db — fecha o pool após o uso', () => {
  const { db, close } = createOwnerDbForSetupOnly()

  afterAll(async () => {
    await close()
  })

  it('executa uma query como owner e fecha o pool no afterAll', async () => {
    const [row] = await db.execute(sql`SELECT 1 AS ok`)
    expect(Number((row as { ok: number }).ok)).toBe(1)
  })
})

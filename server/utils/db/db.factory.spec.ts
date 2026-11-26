import { describe, it, expect } from 'vitest'
import { createDb, type Db } from '../db'

const APP_DATABASE_URL = 'postgres://merp_app:merp_app@localhost:5432/merp_test'

async function withAppDatabaseUrl<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.APP_DATABASE_URL
  process.env.APP_DATABASE_URL = APP_DATABASE_URL
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete process.env.APP_DATABASE_URL
    else process.env.APP_DATABASE_URL = previous
  }
}

describe('createDb (fábrica de driver)', () => {
  it.each(['postgres-js', 'neon-serverless'] as const)(
    '%s retorna instância Drizzle válida sem abrir conexão',
    async (driver) => {
      await withAppDatabaseUrl(async () => {
        const database = (await createDb(driver)) as Db
        expect(database).toBeDefined()
        expect(typeof database.transaction).toBe('function')
        expect(typeof database.execute).toBe('function')
      })
    },
  )

  it('driver inválido lança erro claro', async () => {
    await expect(createDb('banana' as unknown as string)).rejects.toThrow('DB_DRIVER inválida')
  })

  it('sem APP_DATABASE_URL lança erro (sem fallback para DATABASE_URL/owner)', async () => {
    const prev = process.env.APP_DATABASE_URL
    delete process.env.APP_DATABASE_URL
    try {
      await expect(createDb('postgres-js')).rejects.toThrow('APP_DATABASE_URL não definida')
    } finally {
      process.env.APP_DATABASE_URL = prev
    }
  })
})

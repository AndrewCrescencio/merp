import { describe, it, expect } from 'vitest'
import { createDb, type Db } from '../db'

// @neondatabase/serverless é dep opcional (fase 2): só carregada com import()
// dinâmico quando DB_DRIVER=neon-serverless.
let neonPacoteInstalado = false
try {
  import.meta.resolve('@neondatabase/serverless')
  neonPacoteInstalado = true
} catch {
  // não instalado → teste do caminho feliz é pulado abaixo
}

describe('createDb (fábrica de driver)', () => {
  it('postgres-js retorna instância Drizzle válida (conexão é lazy, sem banco)', async () => {
    const database = await createDb('postgres-js')
    expect(database).toBeDefined()
    expect(typeof (database as Db).transaction).toBe('function')
    expect(typeof (database as Db).execute).toBe('function')
  })

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

  describe.skipIf(!neonPacoteInstalado)('neon-serverless (pacote instalado)', () => {
    it('cria instância válida (conexão é lazy, sem banco)', async () => {
      const database = await createDb('neon-serverless')
      expect(database).toBeDefined()
      expect(typeof (database as Db).transaction).toBe('function')
    })
  })

  it('neon-serverless sem o pacote lança instrução de instalação', async () => {
    if (neonPacoteInstalado) return
    await expect(createDb('neon-serverless')).rejects.toThrow(/npm i @neondatabase\/serverless ws/)
  })
})

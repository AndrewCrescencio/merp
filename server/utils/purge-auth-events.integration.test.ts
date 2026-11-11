import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createOwnerDbForSetupOnly } from '../../tests/support/owner-db'
import { sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dbAvailable = process.env.DB_AVAILABLE === 'true'
const suffix = Date.now()

describe.skipIf(!dbAvailable)(
  'purge_auth_events — function DELETE via merp_app (RLS backstop)',
  () => {
    const ownerDb = createOwnerDbForSetupOnly()

    beforeAll(async () => {
      // Aplica a migration 0006 (função purge_auth_events) no banco de teste.
      const migrationSql = readFileSync(
        resolve(__dirname, '../../drizzle/0006_purge_auth_events.sql'),
        'utf-8',
      )
      await ownerDb.execute(sql`${sql.raw(migrationSql)}`)
    })

    afterAll(async () => {
      // Limpa eventos de teste criados.
      await ownerDb.execute(sql`DELETE FROM auth_event WHERE email LIKE 'purge-test@%'`)
    })

    it('DELETE direto de merp_app em auth_event é negado pelo RLS (afeta 0 linhas)', async () => {
      const email = `purge-test-blocked-${suffix}@test.com`
      // Insere uma linha como owner (bypassa RLS) para tentar apagar como merp_app.
      await ownerDb.execute(sql`
        INSERT INTO auth_event (id, email, event_type, ip_address, created_at)
        VALUES (gen_random_uuid(), ${email}, 'session_validated', '127.0.0.1', now())
      `)

      // merp_app (db) não tem policy de DELETE → RLS nega (0 linhas afetadas).
      const { db } = await import('./db')
      await db.execute(sql`DELETE FROM auth_event WHERE email = ${email}`)

      // Verifica que a linha ainda existe (DELETE não removeu nada).
      const [row] = await ownerDb.execute(sql`
        SELECT count(*) AS cnt FROM auth_event WHERE email = ${email}
      `)
      expect(Number((row as any).cnt)).toBe(1)
    })

    it('a funcao remove so linhas mais velhas que a retenção', async () => {
      const antigo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() // 40 dias atrás
      const recente = new Date().toISOString()
      const emailAntigo = `purge-test-old-${suffix}@test.com`
      const emailNovo = `purge-test-new-${suffix}@test.com`

      await ownerDb.execute(sql`
        INSERT INTO auth_event (id, email, event_type, ip_address, created_at)
        VALUES
          (gen_random_uuid(), ${emailAntigo}, 'session_validated', '127.0.0.1', ${antigo}),
          (gen_random_uuid(), ${emailNovo}, 'session_validated', '127.0.0.1', ${recente})
      `)

      // Chama a funcao com retenção de 30 dias (piso): remove só o antigo (> 30 dias)
      const [result] = await ownerDb.execute(sql`
        SELECT purge_auth_events(interval '30 days') AS deleted
      `)
      const deleted = Number((result as any).deleted)
      expect(deleted).toBe(1)

      // Verifica que o recente ainda existe
      const [row] = await ownerDb.execute(sql`
        SELECT count(*) AS cnt FROM auth_event WHERE email = ${emailNovo}
      `)
      expect(Number((row as any).cnt)).toBe(1)
    })

    it('o piso de 30 dias e respeitado mesmo com retenção menor', async () => {
      const com25Dias = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString()
      const emailFloor = `purge-test-floor-${suffix}@test.com`

      await ownerDb.execute(sql`
        INSERT INTO auth_event (id, email, event_type, ip_address, created_at)
        VALUES (gen_random_uuid(), ${emailFloor}, 'session_validated', '127.0.0.1', ${com25Dias})
      `)

      // Chama com retenção de 1 dia (abaixo do piso): ainda deve respeitar 30 dias,
      // então a linha de 25 dias NAO deve ser removida.
      const [result] = await ownerDb.execute(sql`
        SELECT purge_auth_events(interval '1 day') AS deleted
      `)
      const deleted = Number((result as any).deleted)
      expect(deleted).toBe(0)

      // Verifica que a linha ainda existe
      const [row] = await ownerDb.execute(sql`
        SELECT count(*) AS cnt FROM auth_event WHERE email = ${emailFloor}
      `)
      expect(Number((row as any).cnt)).toBe(1)
    })

    it('chamada como merp_app remove so linhas antigas e respeita o piso de 30 dias', async () => {
      const antigo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
      const recente = new Date().toISOString()
      const com25Dias = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString()
      const emailAntigo = `purge-app-old-${suffix}@test.com`
      const emailNovo = `purge-app-new-${suffix}@test.com`
      const emailFloor = `purge-app-floor-${suffix}@test.com`

      await ownerDb.execute(sql`
        INSERT INTO auth_event (id, email, event_type, ip_address, created_at)
        VALUES
          (gen_random_uuid(), ${emailAntigo}, 'session_validated', '127.0.0.1', ${antigo}),
          (gen_random_uuid(), ${emailNovo}, 'session_validated', '127.0.0.1', ${recente}),
          (gen_random_uuid(), ${emailFloor}, 'session_validated', '127.0.0.1', ${com25Dias})
      `)

      const { db } = await import('./db')
      // merp_app nao tem BYPASSRLS: a funcao e SECURITY DEFINER (dono merp_purge)
      // e deve remover apenas o antigo, respeitando o piso de 30 dias.
      const [result] = await db.execute(
        sql`SELECT purge_auth_events(interval '30 days') AS deleted`,
      )
      expect(Number((result as any).deleted)).toBe(1)

      for (const email of [emailNovo, emailFloor]) {
        const [row] = await ownerDb.execute(
          sql`SELECT count(*) AS cnt FROM auth_event WHERE email = ${email}`,
        )
        expect(Number((row as any).cnt)).toBe(1)
      }
      const [row] = await ownerDb.execute(
        sql`SELECT count(*) AS cnt FROM auth_event WHERE email = ${emailAntigo}`,
      )
      expect(Number((row as any).cnt)).toBe(0)
    })

    it('outras roles nao executam a funcao (REVOKE de PUBLIC mantido)', async () => {
      // Somente merp_app (e o dono merp_purge) tem EXECUTE; PUBLIC foi revogado.
      const grants = (await ownerDb.execute(sql`
        SELECT grantee, privilege_type FROM information_schema.routine_privileges
        WHERE routine_name = 'purge_auth_events'
      `)) as { grantee: string; privilege_type: string }[]
      const executes = grants.filter((g) => g.privilege_type === 'EXECUTE').map((g) => g.grantee)
      expect(executes).toContain('merp_app')
      expect(executes).not.toContain('PUBLIC')
    })
  },
)

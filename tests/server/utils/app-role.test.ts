import { describe, it, expect, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createOwnerDbForSetupOnly } from '../../support/owner-db'

const dbAvailable = process.env.DB_AVAILABLE === 'true'

// A role da aplicação nasce DENTRO da migração (drizzle/0000_functions_and_roles)
// — não de um passo manual que pode faltar. Os atributos têm de ficar RLS-safe
// LOGIN para as sessões da app, nunca BYPASSRLS (senão a app
// leria toda a base de dados ignorando as policies) e nunca SUPERUSER.
// A senha não é verificada aqui de propósito: a migração não pode fixar senha
// (segredo de operação) e o setup de testes define-a por fora com ALTER ROLE.
describe.skipIf(!dbAvailable)('merp_app — role criada pela migração 0000', () => {
  const { db: ownerDb, close: closeOwnerDb } = createOwnerDbForSetupOnly()
  afterAll(() => closeOwnerDb())

  it('é LOGIN, NOBYPASSRLS e não-superuser', async () => {
    const rows = (await ownerDb.execute(sql`
      SELECT rolcanlogin, rolbypassrls, rolsuper
      FROM pg_roles
      WHERE rolname = 'merp_app'
    `)) as unknown as {
      rolcanlogin: boolean
      rolbypassrls: boolean
      rolsuper: boolean
    }[]

    const [role] = rows
    if (!role) {
      throw new Error('merp_app não existe — 0000_functions_and_roles não aplicou')
    }
    expect(role.rolcanlogin).toBe(true)
    expect(role.rolbypassrls).toBe(false)
    expect(role.rolsuper).toBe(false)
  })
})

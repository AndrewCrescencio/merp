import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../server/utils/schema'
import { withRequiredSsl } from '../../server/utils/db'

/**
 * Instância Drizzle com a role owner (bypasses RLS).
 *
 * SOMENTE para setup/fixtures de teste e scripts. Nunca em handlers,
 * middlewares ou asserções de teste — use `db` (role `merp_app`, RLS ativa)
 * para tudo o mais. Importar este helper fora de `tests/` e `scripts/`
 * é bloqueado pela regra `merp/no-owner-db-outside-tests` do ESLint.
 */
export function createOwnerDbForSetupOnly() {
  const ownerConnectionString = process.env.DATABASE_URL!
  const client = postgres(withRequiredSsl(ownerConnectionString))
  // O caller fecha o pool em afterAll — pool aberto segura o worker do vitest.
  return { db: drizzle(client, { schema }), close: () => client.end() }
}

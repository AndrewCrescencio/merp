import postgres from 'postgres'
import { setup as dbSetup } from '../support/test-setup'
import { TEST_OWNER_URL } from '../support/test-urls'

/**
 * globalSetup do projeto e2e: mesmo bootstrap da integração (Postgres +
 * migrações + senha da role merp_app) e limpeza do estado de segurança
 * persistido. `auth_security_state` chaveia rate-limit/lockout por IP/email
 * compartilhados entre runs — sem a limpeza, um re-run a menos de 60s do
 * anterior já nasce com janela cheia (429 no register/login/companies).
 */
export default async function globalSetup(): Promise<void> {
  await dbSetup()

  if (process.env.DB_AVAILABLE !== 'true') return

  const client = postgres(TEST_OWNER_URL, { onnotice: () => {} })
  try {
    await client.unsafe(
      `DELETE FROM auth_security_state WHERE key LIKE 'rate:%' OR key LIKE 'lockout:%'`,
    )
    console.log('[e2e-setup] janelas de rate-limit/lockout limpas')
  } finally {
    await client.end()
  }
}

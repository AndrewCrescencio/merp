import { defineEventHandler, setResponseStatus } from 'h3'
import { sql } from 'drizzle-orm'
import { db } from '~~/server/utils/db'
import { isAuthAvailable } from '#shared/auth'

// Readiness: 200 só com DB acessível; 503 quando o banco está indisponível
// (fail-closed para o load balancer tirar a instância do rotation).
export default defineEventHandler(async (event) => {
  const [authReady, dbReady] = await Promise.all([isAuthAvailable(), checkDatabase()])

  if (!dbReady) {
    setResponseStatus(event, 503)
  }

  return {
    status: dbReady ? 'ok' : 'unavailable',
    auth: authReady ? 'ready' : 'unavailable',
    db: dbReady ? 'ok' : 'unavailable',
  }
})

async function checkDatabase(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`)
    return true
  } catch {
    return false
  }
}

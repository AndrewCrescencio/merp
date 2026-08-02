import { defineEventHandler } from 'h3'
import { sql } from 'drizzle-orm'
import { db } from '~~/server/utils/db'
import { isAuthAvailable } from '#shared/auth'

async function checkDatabase(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`)
    return true
  } catch {
    return false
  }
}

export default defineEventHandler(async () => {
  const [authReady, dbReady] = await Promise.all([isAuthAvailable(), checkDatabase()])

  return {
    status: 'ok',
    auth: authReady ? 'ready' : 'unavailable',
    db: dbReady ? 'ok' : 'unavailable',
  }
})

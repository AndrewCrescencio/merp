import { db } from '~~/server/utils/db'
import { session } from '~~/server/utils/schema'
import { lt } from 'drizzle-orm'
import { logger } from '#shared/logger'

const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

export default defineTask({
  meta: {
    name: 'purge-sessions',
    description: 'Purge expired sessions past TTL + 24h grace period',
  },
  async run({ payload }) {
    const cutoff = new Date(Date.now() - GRACE_PERIOD_MS)

    logger.info('purging_expired_sessions', {
      event: 'session_purge_start',
      cutoff: cutoff.toISOString(),
    })

    try {
      const result = await db.delete(session).where(lt(session.expiresAt, cutoff))

      logger.info('expired_sessions_purged', {
        event: 'session_purge_complete',
        deletedCount: result.count ?? 0,
        cutoff: cutoff.toISOString(),
      })

      return { result: 'success', deletedCount: result.count ?? 0 }
    } catch (error) {
      logger.error('session_purge_failed', {
        event: 'session_purge_error',
        error: error instanceof Error ? error.message : String(error),
      })

      return { result: 'error', error: String(error) }
    }
  },
})

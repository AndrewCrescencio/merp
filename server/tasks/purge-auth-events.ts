import { db } from '~~/server/utils/db'
import { authEvent } from '~~/server/utils/schema'
import { lt } from 'drizzle-orm'
import { logger } from '#shared/logger'

const RETENTION_DAYS = 90

export default defineTask({
  meta: {
    name: 'purge-auth-events',
    description: 'Purge auth events older than the retention window (PII retention)',
  },
  async run() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

    logger.info('purging_stale_auth_events', {
      event: 'auth_event_purge_start',
      cutoff: cutoff.toISOString(),
    })

    try {
      const result = await db.delete(authEvent).where(lt(authEvent.createdAt, cutoff))

      logger.info('stale_auth_events_purged', {
        event: 'auth_event_purge_complete',
        deletedCount: result.count ?? 0,
        cutoff: cutoff.toISOString(),
      })

      return { result: 'success', deletedCount: result.count ?? 0 }
    } catch (error) {
      logger.error('auth_event_purge_failed', {
        event: 'auth_event_purge_error',
        error: error instanceof Error ? error.message : String(error),
      })

      return { result: 'error', error: String(error) }
    }
  },
})

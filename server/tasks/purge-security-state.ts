import { db } from '~~/server/utils/db'
import { authSecurityState } from '~~/server/utils/schema'
import { lt } from 'drizzle-orm'
import { logger } from '#shared/logger'

const STALE_AFTER_MS = 24 * 60 * 60 * 1000 // folga: janela 60s, lockout 30min

export default defineTask({
  meta: {
    name: 'purge-security-state',
    description: 'Purge stale auth security state rows (rate limit + lockout)',
  },
  async run({ payload }) {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS)

    logger.info('purging_stale_security_state', {
      event: 'security_state_purge_start',
      cutoff: cutoff.toISOString(),
    })

    try {
      const result = await db
        .delete(authSecurityState)
        .where(lt(authSecurityState.updatedAt, cutoff))

      logger.info('stale_security_state_purged', {
        event: 'security_state_purge_complete',
        deletedCount: result.count ?? 0,
        cutoff: cutoff.toISOString(),
      })

      return { result: 'success', deletedCount: result.count ?? 0 }
    } catch (error) {
      logger.error('security_state_purge_failed', {
        event: 'security_state_purge_error',
        error: error instanceof Error ? error.message : String(error),
      })

      return { result: 'error', error: String(error) }
    }
  },
})

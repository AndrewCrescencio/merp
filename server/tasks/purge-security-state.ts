import { db } from '~~/server/utils/db'
import { authSecurityState } from '~~/server/utils/schema'
import { lt } from 'drizzle-orm'
import { runPurgeTask } from '~~/server/utils/shared/purge'

const STALE_AFTER_MS = 24 * 60 * 60 * 1000 // folga: janela 60s, lockout 30min

export default defineTask({
  meta: {
    name: 'purge-security-state',
    description: 'Purge stale auth security state rows (rate limit + lockout)',
  },
  async run() {
    return runPurgeTask({
      retentionMs: STALE_AFTER_MS,
      eventPrefix: 'security_state_purge',
      startLog: 'purging_stale_security_state',
      completeLog: 'stale_security_state_purged',
      errorLog: 'security_state_purge_failed',
      remove: async (cutoff) =>
        (await db.delete(authSecurityState).where(lt(authSecurityState.updatedAt, cutoff))).count ??
        0,
    })
  },
})

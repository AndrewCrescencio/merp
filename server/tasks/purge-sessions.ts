import { db } from '~~/server/utils/db'
import { session } from '~~/server/utils/schema'
import { lt } from 'drizzle-orm'
import { runPurgeTask } from '~~/server/utils/shared'

const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

export default defineTask({
  meta: {
    name: 'purge-sessions',
    description: 'Purge expired sessions past TTL + 24h grace period',
  },
  async run() {
    return runPurgeTask({
      retentionMs: GRACE_PERIOD_MS,
      eventPrefix: 'session_purge',
      startLog: 'purging_expired_sessions',
      completeLog: 'expired_sessions_purged',
      errorLog: 'session_purge_failed',
      remove: async (cutoff) =>
        (await db.delete(session).where(lt(session.expiresAt, cutoff))).count ?? 0,
    })
  },
})

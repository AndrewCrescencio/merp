import { db } from '~~/server/utils/db'
import { authEvent } from '~~/server/utils/schema'
import { lt } from 'drizzle-orm'
import { runPurgeTask } from '~~/server/utils/shared/purge'

const RETENTION_DAYS = 90

export default defineTask({
  meta: {
    name: 'purge-auth-events',
    description: 'Purge auth events older than the retention window (PII retention)',
  },
  async run() {
    return runPurgeTask({
      retentionMs: RETENTION_DAYS * 24 * 60 * 60 * 1000,
      eventPrefix: 'auth_event_purge',
      startLog: 'purging_stale_auth_events',
      completeLog: 'stale_auth_events_purged',
      errorLog: 'auth_event_purge_failed',
      remove: async (cutoff) =>
        (await db.delete(authEvent).where(lt(authEvent.createdAt, cutoff))).count ?? 0,
    })
  },
})

import { defineTask } from 'nitropack/runtime'
import { runPurgeTask } from '~~/server/utils/shared/purge'
import { db } from '~~/server/utils/db'
import { session } from '~~/server/utils/schema'
import { lt } from 'drizzle-orm'

/**
 * Purge de sessões expiradas (Better Auth).
 * Coluna de expiração: `session.expires_at`.
 * Roda de hora em hora via nitro.scheduledTasks.
 */
const RETENTION_MS = 24 * 60 * 60 * 1000 // 1 dia: sessões expiradas há mais de 1 dia são removidas

export default defineTask({
  meta: {
    name: 'purge-session',
  },
  async run() {
    return await runPurgeTask({
      retentionMs: RETENTION_MS,
      eventPrefix: 'purge_session',
      startLog: 'purge_session_start',
      completeLog: 'purge_session_complete',
      errorLog: 'purge_session_error',
      remove: async (cutoff) => {
        const results = await db
          .delete(session)
          .where(lt(session.expiresAt, cutoff))
          .returning({ id: session.id })
        return results.length
      },
    })
  },
})

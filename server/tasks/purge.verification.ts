import { defineTask } from 'nitropack/runtime'
import { runPurgeTask } from '~~/server/utils/shared/purge'
import { db } from '~~/server/utils/db'
import { verification } from '~~/server/utils/schema'
import { lt } from 'drizzle-orm'

/**
 * Purge de verificações expiradas (email/verificação de senha).
 * Coluna de expiração: `verification.expires_at`.
 * Roda de hora em hora via nitro.scheduledTasks.
 */
const RETENTION_MS = 24 * 60 * 60 * 1000 // 1 dia

export default defineTask({
  meta: {
    name: 'purge-verification',
  },
  async run() {
    return await runPurgeTask({
      retentionMs: RETENTION_MS,
      eventPrefix: 'purge_verification',
      startLog: 'purge_verification_start',
      completeLog: 'purge_verification_complete',
      errorLog: 'purge_verification_error',
      remove: async (cutoff) => {
        const results = await db
          .delete(verification)
          .where(lt(verification.expiresAt, cutoff))
          .returning({ id: verification.id })
        return results.length
      },
    })
  },
})

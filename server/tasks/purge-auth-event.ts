import { defineTask } from 'nitropack/runtime'
import { runPurgeTask } from '~~/server/utils/shared/purge'
import { db } from '~~/server/utils/db'
import { authEvent } from '~~/server/utils/schema'
import { lt } from 'drizzle-orm'

/**
 * Purge de eventos de auth (auth_event) por retenção de tempo.
 * Coluna de referência: `auth_event.createdAt`.
 * Retenção: `AUTH_EVENT_RETENTION_DAYS` (default 90, mínimo 30 imposto no banco).
 * Roda de hora em hora via nitro.scheduledTasks.
 */
const DEFAULT_RETENTION_DAYS = 90
const MIN_RETENTION_DAYS = 30

function retentionDays(): number {
  const raw = process.env.AUTH_EVENT_RETENTION_DAYS
  const days = raw ? Number(raw) : DEFAULT_RETENTION_DAYS
  if (!Number.isFinite(days) || days < MIN_RETENTION_DAYS) {
    return MIN_RETENTION_DAYS
  }
  return days
}

export default defineTask({
  meta: {
    name: 'purge-auth-event',
  },
  async run() {
    return await runPurgeTask({
      retentionMs: retentionDays() * 24 * 60 * 60 * 1000,
      eventPrefix: 'purge_auth_event',
      startLog: 'purge_auth_event_start',
      completeLog: 'purge_auth_event_complete',
      errorLog: 'purge_auth_event_error',
      remove: async (cutoff) => {
        const results = await db
          .delete(authEvent)
          .where(lt(authEvent.createdAt, cutoff))
          .returning({ id: authEvent.id })
        return results.length
      },
    })
  },
})

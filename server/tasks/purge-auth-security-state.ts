import { defineTask } from 'nitropack/runtime'
import { runPurgeTask } from '~~/server/utils/shared/purge'
import { db } from '~~/server/utils/db'
import { authSecurityState } from '~~/server/utils/schema'
import { lt } from 'drizzle-orm'

/**
 * Purge de estado de segurança expirado (rate limit, lockout).
 * Coluna de expiração: `auth_security_state.updatedAt` (não há expires_at;
 * linhas sem atividade recente são removidas).
 * Roda de hora em hora via nitro.scheduledTasks.
 */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias sem atividade

export default defineTask({
  meta: {
    name: 'purge-auth-security-state',
  },
  async run() {
    return await runPurgeTask({
      retentionMs: RETENTION_MS,
      eventPrefix: 'purge_auth_security_state',
      startLog: 'purge_auth_security_state_start',
      completeLog: 'purge_auth_security_state_complete',
      errorLog: 'purge_auth_security_state_error',
      remove: async (cutoff) => {
        const results = await db
          .delete(authSecurityState)
          .where(lt(authSecurityState.updatedAt, cutoff))
          .returning({ id: authSecurityState.key })
        return results.length
      },
    })
  },
})

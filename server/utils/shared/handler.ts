import { defineEventHandler, type H3Event, createError } from 'h3'
import type { AuthContextUser } from './auth-context'

/**
 * Wrapper for authenticated endpoints.
 * Session, rate limit (60/min) and session_validated already ran in
 * server/middleware/auth.ts — calling checkUserRateLimit here de novo cobraria
 * 2 tokens por request e dobraria o teto documentado (60/min → 30/min).
 *
 * Não resolve tenant: handler que precise de companyId no path usa
 * `requireTenant(event)` (R5), do `~~/server/utils/shared/auth-context`.
 */
export function defineAuthHandler<T extends AuthContextUser = AuthContextUser>(
  handler: (event: H3Event, user: T) => Promise<unknown>,
) {
  return defineEventHandler(async (event) => {
    const user = event.context.user as T | undefined
    const session = event.context.session as { id: string } | undefined

    if (!user || !session) {
      throw createError({
        status: 401,
        statusText: '401',
        message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
      })
    }

    event.context.user = user
    event.context.session = session
    event.context.tenantId = event.context.tenantId ?? null
    event.context.userId = user.id

    return handler(event, user)
  })
}

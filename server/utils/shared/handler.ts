import { defineEventHandler, type H3Event } from 'h3'
import { sendUnauthorizedError } from './errors'
import type { AuthContextUser } from './auth-context'

/**
 * Wrapper for authenticated endpoints.
 * Session, rate limit (60/min) and session_validated already ran in
 * server/middleware/auth.ts — calling checkUserRateLimit here de novo cobraria
 * 2 tokens por request e dobraria o teto documentado (60/min → 30/min).
 *
 * Não resolve tenant: handler que precise de companyId no path usa
 * `requireTenant(event)`, do `~~/server/utils/shared/auth-context`.
 */
export function defineAuthHandler<R>(
  handler: (event: H3Event, user: AuthContextUser) => Promise<R> | R,
) {
  return defineEventHandler(async (event) => {
    const { user, session } = event.context
    if (!user || !session) sendUnauthorizedError('Authentication required.')
    return handler(event, user)
  })
}

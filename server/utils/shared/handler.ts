import { defineEventHandler, type H3Event } from 'h3'
import { sendUnauthorizedError } from './errors'
import type { AuthContextUser } from './auth-context'

/**
 * Wrapper for authenticated endpoints.
 * Session, rate limit (120/min) and session_validated already ran in
 * server/middleware/auth.ts. No additional rate-limit token is charged here.
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

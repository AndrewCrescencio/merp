import { defineEventHandler, readBody, type H3Event } from 'h3'
import { createError } from 'h3'
import {
  background,
  checkIpRateLimit,
  checkUserRateLimit,
  createAuthEvent,
  sendAuthError,
  sendAuthUnavailableError,
} from './index'

/**
 * Wrapper for authenticated endpoints.
 * Validates session via middleware (user/session/tenantId already in context).
 * Runs user rate limit (60/min) and emits session_validated event.
 */
export function defineAuthHandler<T extends Record<string, any> = { id: string; email: string }>(
  handler: (event: H3Event, user: T) => Promise<any>,
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

    await checkUserRateLimit(event, user.id)

    event.context.user = user
    event.context.session = session
    event.context.tenantId = event.context.tenantId ?? null
    event.context.userId = user.id

    return handler(event, user)
  })
}

/**
 * Wrapper for public endpoints with IP rate limiting.
 * Runs checkIpRateLimit before readBody (blocks large bodies without parsing).
 */
export function definePublicHandler(
  handler: (event: H3Event, body: any) => Promise<any>,
  options?: { rateLimit?: 'ip' | 'email'; validateBody?: (body: any) => void },
) {
  return defineEventHandler(async (event) => {
    if (options?.rateLimit === 'ip') {
      await checkIpRateLimit(event)
    }

    const body = await readBody(event)

    if (options?.validateBody) {
      options.validateBody(body)
    }

    if (options?.rateLimit === 'email' && body?.email) {
      await checkIpRateLimit(event)
    }

    return handler(event, body)
  })
}

/**
 * Wrapper for Better Auth endpoints (register, login, etc.)
 * Handles Better Auth initialization failures with 503 auth_unavailable.
 */
export function defineBetterAuthHandler(
  handler: (
    event: H3Event,
    auth: Awaited<ReturnType<typeof import('#shared/auth').getAuth>>,
    body: any,
  ) => Promise<any>,
) {
  return defineEventHandler(async (event) => {
    const body = await readBody(event)

    let authInstance: Awaited<ReturnType<typeof import('#shared/auth').getAuth>>
    try {
      const { getAuth } = await import('#shared/auth')
      authInstance = await getAuth()
    } catch (error) {
      sendAuthUnavailableError()
    }

    return handler(event, authInstance, body)
  })
}

/**
 * Session lifecycle event emitter (FR-023) - fire-and-forget.
 */
export function emitSessionEvent(
  event: H3Event,
  input: {
    sessionId: string | null
    userId: string | null
    email: string
    tenantId: string | null
    eventType: 'session_validated' | 'session_expired' | 'session_created' | 'session_invalidated'
  },
): void {
  background(
    event,
    createAuthEvent({
      userId: input.userId,
      email: input.email,
      eventType: input.eventType,
      metadata: {
        sessionId: input.sessionId,
        userId: input.userId,
        tenantId: input.tenantId,
      },
    }),
    `session:${input.eventType}`,
  )
}

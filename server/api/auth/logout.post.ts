import { defineEventHandler, appendResponseHeaders } from 'h3'
import { getAuth } from '#shared/auth'
import type { AuthInstance } from '#shared/auth'
import { logger } from '#shared/logger'
import {
  createAuthEvent,
  getClientIp,
  sendAuthUnavailableError,
  sendUnauthorizedError,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const session = event.context.session as { id: string } | undefined
  const user = event.context.user as { id: string; email: string } | undefined

  if (!session) {
    sendUnauthorizedError('No active session.')
  }

  // FR-025: 503 auth_unavailable se o Better Auth não puder ser resolvido.
  let authInstance: AuthInstance
  try {
    authInstance = await getAuth()
  } catch (error) {
    logger.error('Better Auth instance unavailable', { error: String(error) })
    sendAuthUnavailableError()
  }

  // signOut expira o cookie de sessão nos response headers do retorno —
  // sem forwarding o cookie morto fica no navegador.
  const result = await authInstance.api.signOut({
    headers: event.headers,
    returnHeaders: true,
  })

  const setCookies = result.headers?.getSetCookie?.() ?? []
  if (setCookies.length > 0) {
    appendResponseHeaders(event, { 'set-cookie': setCookies })
  }

  const ip = getClientIp(event)

  // FR-023: session_invalidated — sessão encerrada pelo logout.
  await createAuthEvent({
    userId: user?.id ?? null,
    email: user?.email ?? 'unknown',
    eventType: 'session_invalidated',
    ipAddress: ip || null,
    metadata: {
      sessionId: session?.id ?? null,
      userId: user?.id ?? null,
    },
  })

  if (user) {
    await createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'logout',
      ipAddress: ip || null,
    })
  }

  return { message: 'Logged out successfully' }
})

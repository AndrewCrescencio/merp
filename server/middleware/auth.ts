import { defineEventHandler, getCookie, getRequestURL } from 'h3'
import { getAuth } from '#shared/auth'
import type { AuthInstance } from '#shared/auth'
import { logger } from '#shared/logger'
import { sendAuthError, sendAuthUnavailableError } from '~~/server/utils/shared/errors'
import { createAuthEvent } from '~~/server/utils/shared/audit'

const publicRoutes = ['/api/auth/register', '/api/auth/login', '/api/health', '/']

// FR-023: eventos de ciclo de vida da sessão. O registro do evento é
// fire-and-forget — falha na auditoria não pode bloquear nem falhar a
// requisição (nem adicionar latência a cada request validado).
function emitSessionEvent(input: {
  sessionId: string | null
  userId: string | null
  email: string
  tenantId: string | null
  eventType: 'session_validated' | 'session_expired'
}): void {
  void createAuthEvent({
    userId: input.userId,
    email: input.email,
    eventType: input.eventType,
    metadata: {
      sessionId: input.sessionId,
      userId: input.userId,
      tenantId: input.tenantId,
    },
  }).catch((error: unknown) => {
    logger.warn('Failed to emit auth event', {
      eventType: input.eventType,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  if (publicRoutes.includes(path)) {
    return
  }

  // FR-025: se a instância do Better Auth não puder ser resolvida (falha de
  // inicialização), responda 503 auth_unavailable em vez de 401 espúrio.
  let authInstance: AuthInstance
  try {
    authInstance = await getAuth()
  } catch (error) {
    logger.error('Better Auth instance unavailable', { error: String(error) })
    sendAuthUnavailableError()
  }

  const session = await authInstance.api.getSession({ headers: event.headers })

  if (!session) {
    const sessionToken = getCookie(event, 'merp-session_token')

    if (sessionToken) {
      logger.warn('session_expired', {
        event: 'session_expired',
        path,
        timestamp: new Date().toISOString(),
      })

      // FR-023: session_expired. O cookie de sessão expirado não permite
      // resolver userId/sessionId (o getSession já retornou null) — email
      // 'unknown' documenta a limitação da coluna NOT NULL.
      emitSessionEvent({
        sessionId: null,
        userId: null,
        email: 'unknown',
        tenantId: null,
        eventType: 'session_expired',
      })

      sendAuthError(401, 'session_expired', 'Session expired. Please login again.')
    }

    sendAuthError(401, 'unauthorized', 'Authentication required.')
  }

  emitSessionEvent({
    sessionId: session.session.id,
    userId: session.user.id,
    email: session.user.email,
    tenantId: (session.session as any)?.activeCompanyId ?? null,
    eventType: 'session_validated',
  })

  event.context.user = session.user
  event.context.session = session.session
  event.context.tenantId = (session.session as any)?.activeCompanyId ?? null
  event.context.userId = session.user.id
})

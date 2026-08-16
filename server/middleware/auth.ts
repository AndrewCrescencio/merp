import { defineEventHandler, getCookie, getRequestURL, appendResponseHeaders } from 'h3'
import { getAuth } from '#shared/auth'
import type { AuthInstance } from '#shared/auth'
import { logger } from '#shared/logger'
import { sendAuthError, sendAuthUnavailableError } from '~~/server/utils/shared/errors'
import { createAuthEvent } from '~~/server/utils/shared/audit'

const publicRoutes = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/verify-email',
  '/api/auth/reset-password',
  // AUD-04: inicia o fluxo de recuperação — sempre deslogado por definição.
  '/api/auth/forget-password',
  '/api/health',
  '/',
]

// AUD-09: o GET /api/auth/reset-password/<token> (clique no link do email) é
// dinâmico — prefixo em vez de match exato. Os fluxos de verificação e reset
// se autenticam pelo próprio token (uso único + TTL 1h) com rate limit por IP;
// exigir sessão quebrava o deadlock de email não-verificado (register →
// verify-link 401 → login 403) e impedia reset de senha de quem não está logado.
const publicRoutePrefixes = ['/api/auth/reset-password/']

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

  if (
    publicRoutes.includes(path) ||
    publicRoutePrefixes.some((prefix) => path.startsWith(prefix))
  ) {
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

  // getSession responde com Set-Cookie em dois casos: sessão expirada
  // (deleteSessionCookie expira o cookie no navegador) e refresh de sessão.
  // Sem forwarding, o cookie morto fica no cliente para sempre.
  const sessionResult = await authInstance.api.getSession({
    headers: event.headers,
    returnHeaders: true,
  })

  const setCookies = sessionResult.headers?.getSetCookie?.() ?? []
  if (setCookies.length > 0) {
    appendResponseHeaders(event, { 'set-cookie': setCookies })
  }

  const session = sessionResult.response

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

import { defineEventHandler, getCookie, getRequestURL, appendResponseHeaders } from 'h3'
import { getAuth } from '#shared/auth'
import type { AuthInstance } from '#shared/auth'
import { logger } from '#shared/logger'
import { SESSION_COOKIE_NAME } from '#shared/app'
import {
  // Limite das rotas autenticadas comuns; rotas públicas aplicam seu próprio
  // limite por IP/e-mail nos handlers correspondentes.
  checkApiCommonRateLimit,
  // Funções auxiliares do middleware:
  background,
  createAuthEvent,
  sendAuthError,
  sendAuthUnavailableError,
} from '~~/server/utils/shared'

const publicRoutes = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/email/verification/confirm',
  '/api/auth/password/reset',
  // inicia o fluxo de recuperação — sempre deslogado por definição.
  '/api/auth/password/forgot',
  // reenvio do link de verificação — conta não-verificada não tem
  // sessão (login devolve 403); exigir sessão criaria deadlock no onboarding.
  '/api/auth/email/verification',
  // Health: liveness (sempre 200) e readiness (503 se o banco cair) — públicos
  // para o healthcheck do Docker/load balancer sem sessão.
  '/api/health/live',
  '/api/health/ready',
  // RFC 9116: scanners de segurança buscam anonimamente — exigir sessão
  // quebraria o propósito do arquivo.
  '/.well-known/security.txt',
  '/',
  // OpenAPI do Nitro (experimental.openAPI): spec + UIs existem SÓ em dev —
  // `openAPI.production` continua false, então em produção não há handler
  // sobrando para expor. Exigir sessão aqui só esconderia a doc local.
  '/_openapi.json',
  '/_scalar',
  '/_swagger',
  // Public pages (no auth required)
  '/auth/register',
  '/auth/login',
  '/auth/verify-email',
  '/auth/forget-password',
  '/auth/reset-password',
]

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  if (publicRoutes.includes(path)) {
    return
  }

  // se a instância do Better Auth não puder ser resolvida (falha de
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
    const sessionToken = getCookie(event, SESSION_COOKIE_NAME)

    if (sessionToken) {
      logger.warn('session_expired', {
        event: 'session_expired',
        path,
        timestamp: new Date().toISOString(),
      })

      // O cookie de sessão expirado não permite
      // resolver userId/sessionId (o getSession já retornou null) — email
      // 'unknown' documenta a limitação da coluna NOT NULL.
      background(
        event,
        createAuthEvent({
          userId: null,
          email: 'unknown',
          eventType: 'session_expired',
          metadata: { sessionId: null, userId: null },
        }),
        'session:session_expired',
      )

      sendAuthError(401, 'session_expired', 'Session expired. Please login again.')
    }

    sendAuthError(401, 'unauthorized', 'Authentication required.')
  }

  // Limite por usuário para operações autenticadas comuns (120/min). As rotas
  // públicas não passam por este middleware e limitam IP/e-mail nos handlers.
  await checkApiCommonRateLimit(event, session.user.id)

  event.context.user = session.user
  event.context.session = session.session
})

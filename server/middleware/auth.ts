import { defineEventHandler, getCookie, getRequestURL, appendResponseHeaders } from 'h3'
import type { H3Event } from 'h3'
import { getAuth } from '#shared/auth'
import type { AuthInstance } from '#shared/auth'
import { logger } from '#shared/logger'
import { SESSION_COOKIE_NAME } from '#shared/app'
import {
  // Rate limits proporcionais por tipo de operação (ver security.ts):
  //   checkLoginRateLimit     → 10/min (brute-force login)
  //   checkPasswordResetRateLimit → 5/min (forgot password)
  //   checkApiCommonRateLimit → 120/min (leitura/ops comuns autenticadas)
  //   checkHeavyOperationRateLimit → 20/min (exportações, bulk actions)
  //   checkExportRateLimit    → 5/min (exportações em massa)
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

// eventos de ciclo de vida da sessão. O registro do evento é
// fire-and-forget — falha na auditoria não pode bloquear nem falhar a
// requisição (nem adicionar latência a cada request validado).
function emitSessionEvent(
  event: H3Event,
  input: {
    sessionId: string | null
    userId: string | null
    email: string
    eventType: 'session_validated' | 'session_expired'
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
      },
    }),
    `session:${input.eventType}`,
  )
}

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

      // session_expired. O cookie de sessão expirado não permite
      // resolver userId/sessionId (o getSession já retornou null) — email
      // 'unknown' documenta a limitação da coluna NOT NULL.
      emitSessionEvent(event, {
        sessionId: null,
        userId: null,
        email: 'unknown',
        eventType: 'session_expired',
      })

      sendAuthError(401, 'session_expired', 'Session expired. Please login again.')
    }

    sendAuthError(401, 'unauthorized', 'Authentication required.')
  }

  // teto por usuário para ops comuns autenticadas — 120/min, proporcional
  // ao tráfego típico de um painel/app consumindo a API. O limit rigoroso de
  // login (10/min) e de reset de senha (5/min) são aplicados nos respectivos
  // handlers (login.post.ts, password-reset.post.ts) via checkLoginRateLimit
  // e checkPasswordResetRateLimit.
  await checkApiCommonRateLimit(event, session.user.id)

  emitSessionEvent(event, {
    sessionId: session.session.id,
    userId: session.user.id,
    email: session.user.email,
    eventType: 'session_validated',
  })

  event.context.user = session.user
  event.context.session = session.session
})

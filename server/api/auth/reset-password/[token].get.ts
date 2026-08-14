import { defineEventHandler, getQuery, getRouterParam, sendRedirect } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import { checkIpRateLimit } from '~~/server/utils/shared/security'

// AUD-04: clique no link de reset enviado por email. Valida o token (sem
// consumir — o consumo único acontece no POST /reset-password) e redireciona
// para a origem do app com ?token=... (página futura do frontend) ou
// ?error=INVALID_TOKEN para link inválido/expirado.
// O callbackURL da query é aceito APENAS se a origem casar com a allowlist
// (BETTER_AUTH_URL / CORS_ORIGIN) — o email é gerado com redirectTo=baseURL,
// mas o handler não pode confiar em input do usuário (anti-open-redirect).
export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const token = getRouterParam(event, 'token')
  const callbackURL = getQuery(event).callbackURL
  const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3000'
  const allowedOrigins = new Set<string>([
    new URL(baseURL).origin,
    ...(process.env.CORS_ORIGIN ? [new URL(process.env.CORS_ORIGIN).origin] : []),
  ])

  let origin = new URL(baseURL).origin
  if (typeof callbackURL === 'string' && callbackURL) {
    try {
      const candidate = new URL(callbackURL, baseURL).origin
      if (allowedOrigins.has(candidate)) origin = candidate
    } catch {
      // callbackURL malformado → mantém a origem padrão
    }
  }

  const valid =
    typeof token === 'string' && token ? await identityRepository.validateResetToken(token) : false

  await sendRedirect(
    event,
    valid ? `${origin}/?token=${encodeURIComponent(token!)}` : `${origin}/?error=INVALID_TOKEN`,
    302,
  )
})

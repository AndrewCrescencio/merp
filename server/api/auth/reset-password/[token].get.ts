import { defineEventHandler, getRouterParam, sendRedirect } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import { checkIpRateLimit } from '~~/server/utils/shared/security'

// AUD-04/AUD-08: clique no link de reset enviado por email. Valida o token
// (sem consumir — o consumo único acontece no POST /reset-password) e
// redireciona para a origem do app (BETTER_AUTH_URL) com ?token=... (página
// futura do frontend) ou ?error=INVALID_TOKEN para link inválido/expirado.
// O destino do redirect é derivado SÓ de config de servidor — o callbackURL
// da query é ignorado por completo (anti-open-redirect AUD-08): o email é
// gerado server-side com redirectTo=baseURL, então input do usuário nunca
// influencia o destino.
export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const token = getRouterParam(event, 'token')
  const appOrigin = new URL(process.env.BETTER_AUTH_URL || 'http://localhost:3000').origin

  const valid =
    typeof token === 'string' && token ? await identityRepository.validateResetToken(token) : false

  await sendRedirect(
    event,
    valid
      ? `${appOrigin}/?token=${encodeURIComponent(token!)}`
      : `${appOrigin}/?error=INVALID_TOKEN`,
    302,
  )
})

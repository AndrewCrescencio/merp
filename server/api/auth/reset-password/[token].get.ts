import { defineEventHandler, getRouterParam, sendRedirect } from 'h3'
import { checkIpRateLimit } from '~~/server/utils/shared'
import { db } from '~~/server/utils/db'
import { verification } from '~~/server/utils/schema'
import { and, eq, gt } from 'drizzle-orm'

// AUD-04/AUD-08: clique no link de reset enviado por email. Valida o token
// (sem consumir — o consumo único acontece no POST /reset-password) e
// redireciona para a origem do app (BETTER_AUTH_URL) com o token no
// FRAGMENTO de hash (#/reset-password?token=...) — fragment nunca é enviado
// ao servidor, não entra em logs (nginx/app/proxies) nem em Referer; só fica
// no address bar do navegador (limpo pelo app.vue). O destino do redirect é
// derivado SÓ de config de servidor — o callbackURL da query é ignorado por
// completo (anti-open-redirect AUD-08): o email é gerado server-side com
// redirectTo=baseURL, então input do usuário nunca influencia o destino.
export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const token = getRouterParam(event, 'token')
  const appOrigin = new URL(process.env.BETTER_AUTH_URL || 'http://localhost:3000').origin

  const isValid =
    typeof token === 'string' && token
      ? (await db
          .select({ id: verification.id })
          .from(verification)
          .where(
            and(
              eq(verification.identifier, `reset-password:${token}`),
              gt(verification.expiresAt, new Date()),
            ),
          )
          .limit(1))
        .then(([found]) => !!found)
      : false

  await sendRedirect(
    event,
    isValid
      ? `${appOrigin}/#/reset-password?token=${encodeURIComponent(token!)}`
      : `${appOrigin}/?error=INVALID_TOKEN`,
    302,
  )
})

import { defineEventHandler, readBody, createError } from 'h3'
import { inviteRepository } from '~~/server/utils/auth/invite/repository'
import { sendValidationError } from '~~/server/utils/shared/errors'
import { createAuthEvent } from '~~/server/utils/shared/audit'
import { getClientIp } from '~~/server/utils/shared/ip'
import { checkIpRateLimit } from '~~/server/utils/shared/security'

// AUD-01: aceite por token secreto de uso único (256 bits). O token já
// identifica o convite (linha tem company_id) — companyId não precisa ser
// enviado. Respostas de erro são genéricas (404 "not found or expired"):
// token inválido/expirado/reaplicado são indistinguíveis (anti-enumeração).
export default defineEventHandler(async (event) => {
  // AUD-11: rate limit por IP — tentativas de aceite por token são mutações
  // (claim + INSERT) e devem ser limitadas como as demais.
  await checkIpRateLimit(event)

  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const body = await readBody<{ token?: string }>(event)

  if (!body?.token || typeof body.token !== 'string' || body.token.length === 0) {
    sendValidationError('token is required')
  }

  const accepted = await inviteRepository.acceptInvite(body.token, user.email, user.id)

  const ip = getClientIp(event)
  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'invite_accepted',
    ipAddress: ip || null,
    metadata: { companyId: accepted.companyId },
  })

  return {
    id: accepted.id,
    companyId: accepted.companyId,
    acceptedAt: accepted.acceptedAt,
  }
})

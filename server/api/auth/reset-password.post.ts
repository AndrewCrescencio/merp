import { defineEventHandler, getQuery, readBody } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import { checkIpRateLimit } from '~~/server/utils/shared/security'
import { sendValidationError } from '~~/server/utils/shared/errors'

// AUD-04: define a nova senha com o token de reset (uso único, TTL 1h).
// Todas as sessões do usuário são revogadas (revokeSessionsOnPasswordReset).
// Token aceito via body ou query — o cliente oficial do better-auth envia
// nos dois lugares.
export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const body = await readBody<{ token?: string; newPassword?: string }>(event)

  if (!body?.newPassword || typeof body.newPassword !== 'string' || body.newPassword.length < 8) {
    sendValidationError('Password must be at least 8 characters')
  }

  const token = typeof body?.token === 'string' && body.token ? body.token : getQuery(event).token
  if (typeof token !== 'string' || !token) {
    sendValidationError('Invalid or expired reset link')
  }

  await identityRepository.resetPassword(token, body.newPassword)

  return { status: true }
})

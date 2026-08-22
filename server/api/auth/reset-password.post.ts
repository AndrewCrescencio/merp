import { defineEventHandler, getQuery, readBody } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import {
  checkIpRateLimit,
  isWeakPassword,
  MAX_PASSWORD_LENGTH,
} from '~~/server/utils/shared/security'
import { checkPasswordBreach } from '~~/server/utils/shared/hibp'
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

  // AUD-14: teto superior — senha de megabytes custaria scrypt desproporcional
  // no reset (mesmo limite do register/login).
  if (body.newPassword.length > MAX_PASSWORD_LENGTH) {
    sendValidationError('Password must be at most 128 characters')
  }

  if (isWeakPassword(body.newPassword)) {
    sendValidationError('Password is too common. Choose a stronger password.')
  }

  // NIST 800-63B: check against breached passwords (HIBP k-anonymity)
  const breach = await checkPasswordBreach(body.newPassword)
  if (breach.breached) {
    sendValidationError(
      'This password has appeared in data breaches. Please choose a different password.',
    )
  }

  const token = typeof body?.token === 'string' && body.token ? body.token : getQuery(event).token
  if (typeof token !== 'string' || !token) {
    sendValidationError('Invalid or expired reset link')
  }

  await identityRepository.resetPassword(token, body.newPassword)

  return { status: true }
})

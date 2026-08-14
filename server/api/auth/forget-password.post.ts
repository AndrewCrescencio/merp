import { defineEventHandler, readBody } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import {
  checkEmailRateLimit,
  checkIpRateLimit,
  normalizeEmail,
} from '~~/server/utils/shared/security'
import { sendValidationError } from '~~/server/utils/shared/errors'

// AUD-04: "esqueci minha senha". Resposta genérica e idêntica para email
// existente ou não (anti-enumeração embutida no better-auth).
export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const body = await readBody<{ email?: string }>(event)

  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email || !email.includes('@')) {
    sendValidationError('Valid email is required')
  }

  await checkEmailRateLimit(event, email)

  await identityRepository.requestPasswordReset(email)

  return {
    status: true,
    message: 'If this email exists in our system, check your email for the reset link',
  }
})

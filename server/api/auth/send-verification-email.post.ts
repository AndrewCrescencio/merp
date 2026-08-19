import { defineEventHandler, readBody } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import {
  checkEmailRateLimit,
  checkIpRateLimit,
  EMAIL_REGEX,
  MAX_EMAIL_LENGTH,
  normalizeEmail,
} from '~~/server/utils/shared/security'
import { sendValidationError } from '~~/server/utils/shared/errors'

// AUD-04: reenvio do link de verificação de email. Resposta genérica
// {status:true} para qualquer email (existente ou não) — anti-enumeração:
// o better-auth mantém piso de 500ms e resposta idêntica; o envio real só
// acontece para conta existente e não-verificada.
export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const body = await readBody<{ email?: string }>(event)

  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email || !EMAIL_REGEX.test(email)) {
    sendValidationError('Valid email is required')
  }

  // AUD-14: teto antes do checkEmailRateLimit — email gigante não vira chave.
  if (email.length > MAX_EMAIL_LENGTH) {
    sendValidationError('Valid email is required')
  }

  await checkEmailRateLimit(event, email)

  await identityRepository.sendVerificationEmail(email)

  return { status: true }
})

import { defineEventHandler, getQuery } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import { checkIpRateLimit } from '~~/server/utils/shared/security'
import { sendValidationError } from '~~/server/utils/shared/errors'

// AUD-04: destino do link de verificação de email (GET — convenção de links
// de email; o token é um JWT assinado com TTL de 1h). Idempotente: verificar
// email já verificado responde sucesso normalmente.
export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const { token } = getQuery(event)
  if (typeof token !== 'string' || !token) {
    sendValidationError('Invalid or expired verification link')
  }

  await identityRepository.verifyEmail(token)

  return { status: true }
})

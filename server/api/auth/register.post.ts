import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { identityRepository, generateUserId } from '~~/server/utils/auth/identity/repository'
import {
  checkEmailRateLimit,
  checkIpRateLimit,
  MAX_CONSENT_VERSION_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  normalizeEmail,
} from '~~/server/utils/shared/security'
import { sendValidationError } from '~~/server/utils/shared/errors'
import { createAuthEvent } from '~~/server/utils/shared/audit'
import { getClientIp } from '~~/server/utils/shared/ip'

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const body = await readBody<{
    email?: string
    password?: string
    name?: string
    consentTermsVersion?: string
  }>(event)

  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''

  if (!email || !email.includes('@')) {
    sendValidationError('Valid email is required')
  }

  // AUD-14: tetos de tamanho — sem eles, emails/names gigantes viram colunas
  // de PII desproporcionais e senhas de megabytes custam scrypt desmedido
  // (o better-auth hasheia antes de validar qualquer coisa).
  if (email.length > MAX_EMAIL_LENGTH) {
    sendValidationError('Valid email is required')
  }

  if (!body?.password || typeof body.password !== 'string' || body.password.length < 8) {
    sendValidationError('Password must be at least 8 characters')
  }

  if (body.password.length > MAX_PASSWORD_LENGTH) {
    sendValidationError('Password must be at most 128 characters')
  }

  if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    sendValidationError('Name is required')
  }

  if (body.name.trim().length > MAX_NAME_LENGTH) {
    sendValidationError('Name must be at most 120 characters')
  }

  // AUD-13: consentimento é a base legal do registro (LGPD) — a conta não
  // pode existir sem a versão dos termos aceita gravada.
  if (
    !body?.consentTermsVersion ||
    typeof body.consentTermsVersion !== 'string' ||
    body.consentTermsVersion.trim().length === 0
  ) {
    sendValidationError('consentTermsVersion is required')
  }

  // AUD-14: versão de termos é identificador curto — teto evita coluna gigante.
  if (body.consentTermsVersion.trim().length > MAX_CONSENT_VERSION_LENGTH) {
    sendValidationError('consentTermsVersion must be at most 50 characters')
  }

  await checkEmailRateLimit(event, email)

  const user = await identityRepository.register({
    email,
    password: body.password,
    name: body.name.trim(),
    consentTermsVersion: body.consentTermsVersion.trim(),
  })

  if (user) {
    const ip = getClientIp(event)
    await createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'registration',
      ipAddress: ip || null,
    })
  }

  // AUD-03: resposta genérica idêntica para email novo e já registrado —
  // mesmo status, corpo derivado do input e timing igualado pelo
  // better-auth (hash de senha em ambos os caminhos).
  setResponseStatus(event, 201)
  return {
    id: user?.id ?? generateUserId(),
    email: user?.email ?? email,
    name: user?.name ?? body.name.trim(),
    createdAt: user?.createdAt ?? new Date(),
  }
})

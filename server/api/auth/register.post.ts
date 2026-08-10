import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { identityRepository, generateUserId } from '~~/server/utils/auth/identity/repository'
import {
  checkEmailRateLimit,
  checkIpRateLimit,
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

  if (!body?.password || typeof body.password !== 'string' || body.password.length < 8) {
    sendValidationError('Password must be at least 8 characters')
  }

  if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    sendValidationError('Name is required')
  }

  await checkEmailRateLimit(event, email)

  const user = await identityRepository.register({
    email,
    password: body.password,
    name: body.name.trim(),
    consentTermsVersion: body.consentTermsVersion,
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

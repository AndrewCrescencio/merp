import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import { checkRateLimit } from '~~/server/utils/shared/security'
import { sendValidationError } from '~~/server/utils/shared/errors'
import { createAuthEvent } from '~~/server/utils/shared/audit'
import { getClientIp } from '~~/server/utils/shared/ip'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    email?: string
    password?: string
    name?: string
    consentTermsVersion?: string
  }>(event)

  if (!body?.email || typeof body.email !== 'string' || !body.email.includes('@')) {
    sendValidationError('Valid email is required')
  }

  if (!body?.password || typeof body.password !== 'string' || body.password.length < 8) {
    sendValidationError('Password must be at least 8 characters')
  }

  if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    sendValidationError('Name is required')
  }

  await checkRateLimit(event, body.email)

  const user = await identityRepository.register({
    email: body.email,
    password: body.password,
    name: body.name.trim(),
    consentTermsVersion: body.consentTermsVersion,
  })

  const ip = getClientIp(event)
  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'registration',
    ipAddress: ip || null,
  })

  setResponseStatus(event, 201)
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  }
})

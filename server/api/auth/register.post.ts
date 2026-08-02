import { defineEventHandler, readBody, setResponseStatus, getRequestIP } from 'h3'
import { authRepository } from '~~/server/utils/auth/repository'
import { checkRateLimit, sendValidationError } from '~~/server/utils/auth/helpers'

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

  const user = await authRepository.register({
    email: body.email,
    password: body.password,
    name: body.name.trim(),
    consentTermsVersion: body.consentTermsVersion,
  })

  const ip = getRequestIP(event, { xForwardedFor: true })
  await authRepository.createAuthEvent({
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

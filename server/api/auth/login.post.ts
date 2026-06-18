import { defineEventHandler, readBody, getRequestIP } from 'h3'
import { authRepository } from '~~/server/utils/auth/repository'
import {
  checkAccountLockout,
  checkRateLimit,
  recordFailedAttempt,
  resetFailedAttempts,
  sendUnauthorizedError,
  sendValidationError,
} from '~~/server/utils/auth/helpers'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string; rememberMe?: boolean }>(event)

  if (!body?.email || !body?.password) {
    sendValidationError('Email and password are required')
  }

  checkRateLimit(event, body.email)

  checkAccountLockout(body.email)

  try {
    const user = await authRepository.signIn(
      {
        email: body.email,
        password: body.password,
        rememberMe: body.rememberMe === true,
      },
      event.headers,
    )

    resetFailedAttempts(body.email)

    const ip = getRequestIP(event, { xForwardedFor: true })
    await authRepository.createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'login',
      ipAddress: ip || null,
    })

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    }
  } catch (error: any) {
    const ip = getRequestIP(event, { xForwardedFor: true })
    await authRepository.createAuthEvent({
      email: body.email,
      eventType: 'failed_login',
      ipAddress: ip || null,
      metadata: { reason: error?.statusCode === 401 ? 'invalid_credentials' : 'unknown' },
    })

    recordFailedAttempt(body.email)

    if (error?.statusCode === 401) {
      sendUnauthorizedError('Invalid email or password')
    }

    throw error
  }
})

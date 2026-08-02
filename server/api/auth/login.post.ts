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

const LOGIN_ERROR_CODES = new Set(['account_locked', 'account_deactivated'])

function getLoginErrorReason(error: any): string {
  if (error?.statusCode !== 401) return 'unknown'
  if (typeof error?.message === 'string') {
    try {
      const parsed = JSON.parse(error.message)
      if (typeof parsed?.error === 'string') {
        return LOGIN_ERROR_CODES.has(parsed.error) ? parsed.error : 'invalid_credentials'
      }
    } catch {
      // message não é JSON — 401 genérico
    }
  }
  return 'invalid_credentials'
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string; rememberMe?: boolean }>(event)

  if (!body?.email || !body?.password) {
    sendValidationError('Email and password are required')
  }

  await checkRateLimit(event, body.email)

  await checkAccountLockout(body.email)

  try {
    const user = await authRepository.signIn(
      {
        email: body.email,
        password: body.password,
        rememberMe: body.rememberMe === true,
      },
      event.headers,
    )

    await resetFailedAttempts(body.email)

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
    const reason = getLoginErrorReason(error)

    await authRepository.createAuthEvent({
      email: body.email,
      eventType: 'failed_login',
      ipAddress: ip || null,
      metadata: { reason },
    })

    await recordFailedAttempt(body.email)

    if (reason === 'account_locked' || reason === 'account_deactivated') {
      throw error
    }

    if (error?.statusCode === 401) {
      sendUnauthorizedError('Invalid email or password')
    }

    throw error
  }
})

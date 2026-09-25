import { callBetterAuth } from './client'
import { sessionRepository } from './session'
import { userRepository } from './user'
import { createAuthEvent } from '../../shared/audit'
import { logger } from '#shared/logger'
import { handleDatabaseError } from '../../shared/errors'
import type { AuthInstance } from '#shared/auth'
import { createError, H3Error } from 'h3'

const TIMING_PAD_PASSWORD = '__aud07_timing_pad__'

export interface RegisterInput {
  email: string
  password: string
  name: string
  consentTermsVersion?: string
}

export interface SignInInput {
  email: string
  password: string
  rememberMe?: boolean
}

export interface UserResult {
  id: string
  email: string
  name: string | null
  isActive: boolean
  consentWithdrawnAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface SessionResult {
  id: string
  userId: string
  token: string
  expiresAt: Date
  rememberMe: boolean
  createdAt: Date
}

export interface SignInResult extends UserResult {
  setCookie: string[]
}

async function runTimingPad(email: string, headers?: Headers): Promise<void> {
  const authInstance = (await callBetterAuth(async (auth) => auth)) as AuthInstance
  await callBetterAuth(
    async (auth) =>
      auth.api.signInEmail({
        body: { email, password: TIMING_PAD_PASSWORD, rememberMe: false },
        headers,
        returnHeaders: true,
      }),
    { timeout: 5_000 },
  )
    .then(async (result: any) => {
      logger.warn('AUD-07: timing pad resolved unexpectedly, revoking session', { email })
      const sessionToken = result?.response?.token
      if (sessionToken) {
        await sessionRepository.terminateSession(sessionToken)
      }
    })
    .catch(() => {})
}

export async function handleDeactivatedAccount(email: string, headers?: Headers): Promise<never> {
  await runTimingPad(email, headers)
  throw createError({
    status: 401,
    statusText: '401',
    message: JSON.stringify({
      error: 'account_deactivated',
      message: 'User has been deactivated',
    }),
  })
}

export async function registerUser(
  input: RegisterInput,
  authInstance: AuthInstance,
): Promise<UserResult | null> {
  try {
    const { user: createdUser } = await callBetterAuth(
      async (auth) =>
        auth.api.signUpEmail({
          body: {
            email: input.email,
            password: input.password,
            name: input.name,
            consentTermsVersion: input.consentTermsVersion,
          } as any,
        }),
      { timeout: 5_000 },
    )

    const existing = await userRepository.findByEmail(input.email)
    if (existing && existing.id !== createdUser.id) {
      return null
    }

    if (input.consentTermsVersion) {
      await userRepository.updateUser(createdUser.id, {
        consentTermsVersion: input.consentTermsVersion,
        consentTermsAcceptedAt: new Date(),
      } as any)
    }

    return {
      id: createdUser.id,
      email: createdUser.email,
      name: createdUser.name,
      isActive: true,
      createdAt: createdUser.createdAt,
      updatedAt: createdUser.createdAt,
    }
  } catch (error: any) {
    if (error?.statusCode === 422) {
      return null
    }
    if (error instanceof H3Error) {
      throw error
    }
    return handleDatabaseError(error)
  }
}

export async function signInUser(input: SignInInput, headers?: Headers): Promise<SignInResult> {
  const existing = await userRepository.findByEmail(input.email)
  if (existing && !existing.isActive) {
    await handleDeactivatedAccount(input.email, headers)
  }

  await sessionRepository.terminateUserSessions(existing?.id ?? '')

  try {
    const result = await callBetterAuth(
      async (auth) =>
        auth.api.signInEmail({
          body: {
            email: input.email,
            password: input.password,
            rememberMe: input.rememberMe ?? false,
          },
          headers,
          returnHeaders: true,
        }),
      { timeout: 5_000 },
    )

    const sessionToken = result.response.token

    void sessionRepository.validateSession(sessionToken).then(async (validated) => {
      if (validated) {
        try {
          await createAuthEvent({
            userId: validated.user.id,
            email: validated.user.email,
            eventType: 'session_created',
            metadata: {
              sessionId: validated.session.id,
              userId: validated.user.id,
              tenantId: (validated.session as any)?.activeCompanyId ?? null,
            },
          })
        } catch (error) {
          logger.warn('Failed to emit session_created event', {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    })

    return {
      id: result.response.user.id,
      email: result.response.user.email,
      name: result.response.user.name,
      isActive: true,
      createdAt: result.response.user.createdAt,
      updatedAt: result.response.user.updatedAt,
      setCookie: result.headers?.getSetCookie?.() ?? [],
    }
  } catch (error: any) {
    if (error?.statusCode === 403) {
      throw createError({
        status: 403,
        statusText: '403',
        message: JSON.stringify({
          error: 'email_not_verified',
          message: 'Please verify your email address before logging in.',
        }),
      })
    }
    throw error
  }
}

export async function sendVerificationEmailBA(email: string): Promise<void> {
  await callBetterAuth(async (auth) => auth.api.sendVerificationEmail({ body: { email } }), {
    timeout: 5_000,
  })
}

export async function verifyEmailBA(token: string): Promise<void> {
  try {
    await callBetterAuth(async (auth) => auth.api.verifyEmail({ query: { token } }), {
      timeout: 5_000,
    })
  } catch (error: any) {
    if (error?.statusCode === 400 || error?.statusCode === 401) {
      throw createError({
        status: 400,
        statusText: '400',
        message: JSON.stringify({
          error: 'validation_error',
          message: 'Invalid or expired verification link',
        }),
      })
    }
    if (error instanceof H3Error) {
      throw error
    }
    return handleDatabaseError(error)
  }
}

export async function requestPasswordResetBA(email: string): Promise<void> {
  const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3000'
  await callBetterAuth(
    async (auth) => auth.api.requestPasswordReset({ body: { email, redirectTo: baseURL } }),
    { timeout: 5_000 },
  )
}

export async function resetPasswordBA(token: string, newPassword: string): Promise<void> {
  try {
    await callBetterAuth(
      async (auth) => auth.api.resetPassword({ query: { token }, body: { newPassword } }),
      { timeout: 5_000 },
    )
  } catch (error: any) {
    if (error?.statusCode === 400) {
      throw createError({
        status: 400,
        statusText: '400',
        message: JSON.stringify({
          error: 'validation_error',
          message: 'Invalid or expired reset link',
        }),
      })
    }
    if (error instanceof H3Error) {
      throw error
    }
    return handleDatabaseError(error)
  }
}

export async function withdrawConsentBA(userId: string): Promise<UserResult> {
  return handleDatabaseError(
    sessionRepository.terminateUserSessions(userId).then(() =>
      userRepository.updateUser(userId, {
        consentWithdrawnAt: new Date(),
        isActive: false,
      } as any),
    ),
  )
}

export async function deactivateUserBA(userId: string): Promise<UserResult> {
  return handleDatabaseError(
    sessionRepository
      .terminateUserSessions(userId)
      .then(() => userRepository.updateUser(userId, { isActive: false } as any)),
  )
}

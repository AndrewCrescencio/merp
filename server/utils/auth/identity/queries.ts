import { callBetterAuth } from './client'
import { createAuthEvent } from '../../shared/audit'
import { db } from '../../../utils/db'
import { verification } from '../../../utils/schema'
import { eq, and, gt } from 'drizzle-orm'
import { logger } from '#shared/logger'
import { handleDatabaseError } from '../../shared/errors'
import type { AuthInstance } from '#shared/auth'
import { createError, H3Error } from 'h3'
import { randomUUID } from 'node:crypto'
import type { RegisterInput } from '../../shared/validate'

// Better Auth user type from the schema
export interface UserResult {
  id: string
  email: string
  name: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  consentTermsVersion?: string | null
  consentTermsAcceptedAt?: Date | null
  consentWithdrawnAt?: Date | null
  emailVerified: boolean
  image?: string | null
}

// Better Auth session type
export interface SessionResult {
  id: string
  userId: string
  token: string
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
  activeCompanyId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

// Better Auth signInEmail response type
export interface SignInResult {
  response: {
    user: UserResult
    session: SessionResult
    token: string
  }
  headers: Headers
  setCookie: string[]
}

const TIMING_PAD_PASSWORD = '__aud07_timing_pad__'

export function generateUserId(): string {
  return randomUUID()
}

export interface SignInInput {
  email: string
  password: string
  rememberMe?: boolean
}

export async function validateResetToken(token: string): Promise<boolean> {
  try {
    const [found] = await db
      .select({ id: verification.id })
      .from(verification)
      .where(
        and(
          eq(verification.identifier, `reset-password:${token}`),
          gt(verification.expiresAt, new Date()),
        ),
      )
      .limit(1)
    return !!found
  } catch {
    return false
  }
}

async function runTimingPad(email: string, headers?: Headers): Promise<void> {
  await callBetterAuth(
    async (auth) =>
      auth.api.signInEmail({
        body: { email, password: TIMING_PAD_PASSWORD, rememberMe: false },
        headers,
        returnHeaders: true,
      }),
    { timeout: 5_000 },
  )
    .then(async (result: { response?: { token?: string }; headers?: Headers }) => {
      logger.warn('AUD-07: timing pad resolved unexpectedly, revoking session', { email })
      const sessionToken = result?.response?.token
      if (sessionToken) {
        await callBetterAuth(
          async (auth) => auth.api.revokeSession({ body: { token: sessionToken } }),
          { timeout: 5_000 },
        )
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
  _authInstance: AuthInstance,
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
          },
        }),
      { timeout: 5_000 },
    )

    // Better Auth signUpEmail returns the created user, so no need to check
    // if email is taken - Better Auth handles this via 422 error

    if (input.consentTermsVersion) {
      await callBetterAuth(
        async (auth) =>
          auth.api.updateUser({
            body: {
              consentTermsVersion: input.consentTermsVersion,
              consentTermsAcceptedAt: new Date(),
            },
          }),
        { timeout: 5_000 },
      )
    }

    return {
      id: createdUser.id,
      email: createdUser.email,
      name: createdUser.name,
      isActive: true,
      createdAt: createdUser.createdAt,
      updatedAt: createdUser.createdAt,
    }
  } catch (error: unknown) {
    const err = error as { statusCode?: number }
    if (err.statusCode === 422) {
      return null
    }
    if (error instanceof H3Error) {
      throw error
    }
    return handleDatabaseError(error)
  }
}

export async function signInUser(input: SignInInput, headers?: Headers): Promise<SignInResult> {
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

    void callBetterAuth(async (auth) => auth.api.revokeSession({ body: { token: sessionToken } }), {
      timeout: 5_000,
    }).then(async (validated) => {
      if (validated) {
        try {
          await createAuthEvent({
            userId: validated.user.id,
            email: validated.user.email,
            eventType: 'session_created',
            metadata: {
              sessionId: validated.session.id,
              userId: validated.user.id,
              tenantId:
                (validated.session as { activeCompanyId?: string })?.activeCompanyId ?? null,
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
      user: result.response.user,
      session: result.response.session,
      headers: result.headers,
      setCookie: result.headers?.getSetCookie?.() ?? [],
    }
  } catch (error: unknown) {
    const err = error as { statusCode?: number; status?: number }
    const status = err.statusCode ?? err.status
    if (status === 403) {
      throw createError({
        status: 403,
        statusText: '403',
        message: JSON.stringify({
          error: 'email_not_verified',
          message: 'Please verify your email address before logging in.',
        }),
      })
    }
    if (status === 401 || status === 403) {
      throw createError({
        status: 401,
        statusText: '401',
        message: JSON.stringify({
          error: 'invalid_credentials',
          message: 'Invalid email or password',
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
  } catch (error: unknown) {
    const err = error as { statusCode?: number }
    if (err.statusCode === 400 || err.statusCode === 401) {
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
  } catch (error: unknown) {
    const err = error as { statusCode?: number }
    if (err.statusCode === 400) {
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
  await callBetterAuth(
    async (auth) => auth.api.revokeSessions({ body: { userId } }),
    { timeout: 5_000 }
  )

  // Update user to mark consent as withdrawn (if the field exists)
  await callBetterAuth(
    async (auth) =>
      auth.api.updateUser({
        body: { consentWithdrawnAt: new Date() },
      }),
    { timeout: 5_000 }
  )

  return { id: userId, email: '', name: '', isActive: false, createdAt: new Date(), updatedAt: new Date() }
}

export async function deactivateUserBA(userId: string): Promise<UserResult> {
  await callBetterAuth(
    async (auth) => auth.api.revokeSessions({ body: { userId } }),
    { timeout: 5_000 }
  )

  // Update user to mark as inactive (if the field exists)
  await callBetterAuth(
    async (auth) =>
      auth.api.updateUser({
        body: { isActive: false },
      }),
    { timeout: 5_000 }
  )

  return { id: userId, email: '', name: '', isActive: false, createdAt: new Date(), updatedAt: new Date() }
}
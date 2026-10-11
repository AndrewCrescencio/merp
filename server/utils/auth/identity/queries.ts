import { callBetterAuth } from './client'
import { createAuthEvent } from '../../shared/audit'
import { db } from '../../../utils/db'
import { verification, authEvent, user, session } from '../../../utils/schema'
import { eq, and, gt } from 'drizzle-orm'
import { logger } from '#shared/logger'
import { handleDatabaseError } from '../../shared/errors'
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
    // null quando a linha de sessão não é localizada logo após o sign-in — o
    // login não pode falhar por causa de um campo de auditoria.
    session: SessionResult | null
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

// AUD-07: lookup único por email (unique index) usado pelo gate de conta
// desativada no signInUser.
export async function findUserByEmail(email: string) {
  const [row] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  return row
}

async function findSessionByToken(token: string) {
  const [row] = await db.select().from(session).where(eq(session.token, token)).limit(1)
  return row
}

// FR-020 (LGPD): exportação lista só os eventos do próprio usuário.
export async function listUserAuthEvents(
  userId: string,
): Promise<(typeof authEvent.$inferSelect)[]> {
  return await db
    .select()
    .from(authEvent)
    .where(eq(authEvent.userId, userId))
    .orderBy(authEvent.createdAt)
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
      const leakedToken = result?.response?.token
      if (leakedToken) {
        // Remove a linha direto (índice unique em token) — o mesmo efeito do
        // revoke, sem depender de round-trip Better Auth.
        await db.delete(session).where(eq(session.token, leakedToken))
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

export async function registerUser(input: RegisterInput): Promise<UserResult | null> {
  try {
    // AUD-03: duplicata responde null (sem 409, sem segunda conta) — melhor
    // auth ecoa um perfil que não é persistido, o que devolveria um id falso.
    if (await findUserByEmail(input.email)) return null

    const { user: createdUser } = await callBetterAuth(
      async (auth) =>
        auth.api.signUpEmail({
          body: {
            email: input.email,
            password: input.password,
            name: input.name,
          },
        }),
      { timeout: 5_000 },
    )

    // FR-021: carimbo de aceite via SQL direto — consentTermsAcceptedAt não é
    // additionalField do melhor auth e updateUser exige sessão (401 aqui).
    await db
      .update(user)
      .set({
        consentTermsVersion: input.consentTermsVersion,
        consentTermsAcceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, createdUser.id))

    return {
      id: createdUser.id,
      email: createdUser.email,
      name: createdUser.name,
      emailVerified: createdUser.emailVerified,
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
  // AUD-07: conta desativada ou com consentimento retirado não pode logar.
  // Fora do try de propósito: o catch abaixo re-mapeia todo 401 para
  // invalid_credentials, o que apagaria account_deactivated E faria a
  // tentativa contar para o lockout (que isenta account_deactivated).
  // handleDeactivatedAccount equaliza o timing com o pad e lança 401.
  const existing = await findUserByEmail(input.email)
  if (existing && !existing.isActive) {
    await handleDeactivatedAccount(input.email, headers)
  }

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

    const { user, token } = result.response

    // FR-023: signInEmail não devolve a sessão — session_id/tenant_id vêm da
    // linha de sessão (índice unique por token): um lookup, não um round-trip.
    // createAuthEvent engole falha internamente, então o void não vira
    // unhandled rejection.
    const sessionRow = await findSessionByToken(token)

    void createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'session_created',
      metadata: {
        sessionId: sessionRow?.id ?? null,
        userId: user.id,
        tenantId: sessionRow?.activeCompanyId ?? null,
      },
    })

    return {
      // `existing` veio do gate AUD-07 acima: o melhor auth não devolve
      // isActive (não é additionalField), mas o UserResult exige.
      response: {
        user: { ...user, isActive: existing?.isActive ?? true },
        session: sessionRow ?? null,
        token,
      },
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

// FR-017: soft delete — o usuário fica inativo (dados preservados) e perde as
// sessões. SQL direto: user/session não têm RLS (tabelas do melhor auth) e
// updateUser/revokeSessions exigem sessão ativa, que estes fluxos não têm.
// FR-021: a retirada de consentimento reusa este caminho — desativação
// imediata + término de sessão. A deleção/anonimização de PII é deferida; o
// registro é o evento consent_withdrawal emitido pelo handler.
async function deactivateWith(
  userId: string,
  set: Partial<typeof user.$inferInsert>,
): Promise<UserResult> {
  const [updated] = await db
    .update(user)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning()

  if (!updated) {
    throw createError({
      status: 404,
      statusText: '404',
      message: JSON.stringify({ error: 'user_not_found', message: 'User not found' }),
    })
  }

  await db.delete(session).where(eq(session.userId, userId))

  return updated
}

export async function deactivateUser(userId: string): Promise<UserResult> {
  return deactivateWith(userId, { isActive: false })
}

export async function withdrawConsent(userId: string): Promise<UserResult> {
  return deactivateWith(userId, { isActive: false, consentWithdrawnAt: new Date() })
}

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { db, type Db } from '~~/server/utils/db'
import * as schema from '~~/server/utils/schema'
import { logger } from './logger'
import { APP_NAME, COOKIE_PREFIX, SESSION_COOKIE_NAME } from '#shared/app'
import { sendPasswordResetNotice, sendVerificationNotice } from '~~/server/utils/shared/email'

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000'
if (process.env.NODE_ENV === 'production' && corsOrigin === 'http://localhost:3000') {
  throw new Error('CORS_ORIGIN é obrigatória em produção (sem fallback localhost).')
}

function createAuth(database: Db = db) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    user: {
      additionalFields: {
        consentTermsVersion: {
          type: 'string',
          required: false,
          input: true,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      // login exige email verificado (OWASP Authentication Cheat
      // Sheet). O link de verificação é enviado no sign-up (sendOnSignUp) e
      // reenviado automaticamente a cada tentativa de login com senha
      // CORRETA de conta não-verificada (sendOnSignIn — o envio só ocorre
      // depois do verify do scrypt, então não há vetor de spam anônimo).
      // Contas pré-existentes (email_verified=false) recebem o link ao
      // tentar logar — migração sem data migration.
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 3600,
      // OWASP: trocar a senha invalida todas as sessões existentes.
      revokeSessionsOnPasswordReset: true,
      // envio real via Resend. O callback é awaitado pelo better-auth
      // (runInBackgroundOrAwait) e nunca lança — ver sendResendEmail.
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetNotice(user.email, url)
      },
    },
    emailVerification: {
      // awaitado pelo better-auth após MINIMUM_MS=500; nunca lança.
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationNotice(user.email, url)
      },
      sendOnSignUp: true,
      sendOnSignIn: true,
      expiresIn: 3600,
    },
    // TTL fixo — rememberMe=7d (expiresIn), sem rememberMe=24h
    // (better-auth usa 24h quando dontRememberMe). disableSessionRefresh
    // evita que o refresh promova sessões de 24h para 7d no primeiro request.
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      disableSessionRefresh: true,
    },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      cookies: {
        session_token: {
          name: SESSION_COOKIE_NAME,
          attributes: {
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
          },
        },
      },
    },
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    trustedOrigins: [corsOrigin],
    appName: APP_NAME,
    plugins: [],
  })
}

export type AuthInstance = ReturnType<typeof createAuth>

let authPromise: Promise<AuthInstance> | null = null

export function getAuth(): Promise<AuthInstance> {
  if (!authPromise) {
    const wrapped = Promise.resolve()
      .then(() => {
        const instance = createAuth()
        logger.info('Better Auth instance initialized', {
          baseURL: process.env.BETTER_AUTH_URL,
          corsOrigin,
        })
        return instance
      })
      .catch((error: unknown) => {
        if (authPromise === wrapped) authPromise = null
        throw error
      })
    authPromise = wrapped
  }
  return authPromise
}

export async function isAuthAvailable(): Promise<boolean> {
  try {
    await getAuth()
    return true
  } catch (error) {
    logger.error('Better Auth initialization failed', { error: String(error) })
    return false
  }
}

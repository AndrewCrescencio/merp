import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { db } from '~~/server/utils/db'
import * as schema from '~~/server/utils/schema'
import { logger } from './logger'
import { appVerificationLink } from '~~/server/utils/shared/email'

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000'
if (process.env.NODE_ENV === 'production' && corsOrigin === 'http://localhost:3000') {
  throw new Error('CORS_ORIGIN é obrigatória em produção (sem fallback localhost).')
}

function createAuth() {
  return betterAuth({
    database: drizzleAdapter(db, {
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
      // AUD-04: login exige email verificado (OWASP Authentication Cheat
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
      // MVP: email queue removed — callbacks are no-op (log only).
      // Better Auth generates correct links; user copies manually if needed.
      sendResetPassword: ({ user, url }) => {
        void logger.info('reset password email (no-op)', { email: user.email, url })
      },
    },
    emailVerification: {
      sendVerificationEmail: ({ user, url }) => {
        void logger.info('verification email (no-op)', { email: user.email, url: appVerificationLink(url) })
      },
      sendOnSignUp: true,
      sendOnSignIn: true,
      expiresIn: 3600,
    },
    // FR-009: TTL fixo — rememberMe=7d (expiresIn), sem rememberMe=24h
    // (better-auth usa 24h quando dontRememberMe). disableSessionRefresh
    // evita que o refresh promova sessões de 24h para 7d no primeiro request.
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      disableSessionRefresh: true,
    },
    advanced: {
      cookiePrefix: 'merp',
      cookies: {
        session_token: {
          name: 'merp-session_token',
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
    appName: 'merp',
    plugins: [],
  })
}

export type AuthInstance = ReturnType<typeof createAuth>

let authPromise: Promise<AuthInstance> | null = null

export function getAuth(): Promise<AuthInstance> {
  if (!authPromise) {
    authPromise = (async () => {
      const instance = createAuth()
      logger.info('Better Auth instance initialized', {
        baseURL: process.env.BETTER_AUTH_URL,
        corsOrigin,
      })
      return instance
    })()
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

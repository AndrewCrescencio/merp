import { and, eq, gt } from 'drizzle-orm'
import { db } from '../../db'
import { getAuth } from '#shared/auth'
import type { AuthInstance } from '#shared/auth'
import { logger } from '#shared/logger'
import { user, session } from '../../schema'
import { createError, H3Error } from 'h3'
import {
  handleDatabaseError,
  handleUpstreamTimeout,
  sendAuthUnavailableError,
  TimeoutError,
  withTimeout,
} from '../../shared/errors'
import { withTenant } from '../tenant-context'
import { createAuthEvent } from '../../shared/audit'

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

export interface SessionWithUser {
  session: SessionResult
  user: UserResult
}

export interface UpdateUserInput {
  name: string
  isActive: boolean
  consentTermsVersion: string
  consentTermsAcceptedAt: Date
  consentWithdrawnAt: Date
}

export interface IIdentityRepository {
  register(input: RegisterInput): Promise<UserResult>
  signIn(input: SignInInput, headers?: Headers): Promise<UserResult>
  findByEmail(email: string): Promise<UserResult | null>
  findById(id: string): Promise<UserResult | null>
  createSession(
    userId: string,
    token: string,
    expiresAt: Date,
    rememberMe: boolean,
  ): Promise<SessionResult>
  validateSession(token: string): Promise<SessionWithUser | null>
  terminateSession(token: string): Promise<void>
  terminateUserSessions(userId: string): Promise<void>
  updateUser(id: string, data: Partial<UpdateUserInput>): Promise<UserResult>
  isEmailTaken(email: string): Promise<boolean>
  withdrawConsent(userId: string): Promise<UserResult>
  deactivateUser(userId: string): Promise<UserResult>
  getUserSessions(userId: string): Promise<Array<{ id: string; createdAt: Date; expiresAt: Date }>>
}

export class IdentityRepository implements IIdentityRepository {
  // FR-025: a instância do Better Auth é resolvida de forma lazy; se a
  // inicialização falhar (shared/auth.ts), os endpoints retornam 503
  // auth_unavailable em vez de crashar no import.
  private async resolveAuth(): Promise<AuthInstance> {
    try {
      return await getAuth()
    } catch (error) {
      logger.error('Failed to resolve Better Auth instance', { error: String(error) })
      sendAuthUnavailableError()
    }
  }

  // FR-024: chamadas OAuth futuras (auth.api.signInOAuth etc.) devem usar
  // withTimeout(..., 10_000) — nenhum provider OAuth está configurado ainda.
  async register(input: RegisterInput): Promise<UserResult> {
    try {
      const authInstance = await this.resolveAuth()
      const { user: createdUser } = await withTimeout(
        authInstance.api.signUpEmail({
          body: {
            email: input.email,
            password: input.password,
            name: input.name,
            consentTermsVersion: input.consentTermsVersion,
          } as any,
        }),
        5_000,
      )

      if (input.consentTermsVersion) {
        await db
          .update(user)
          .set({
            consentTermsVersion: input.consentTermsVersion,
            consentTermsAcceptedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(user.id, createdUser.id))
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
      if (error instanceof TimeoutError) {
        return handleUpstreamTimeout()
      }
      if (error?.statusCode === 409 || error?.message?.includes?.('already')) {
        throw createError({
          status: 409,
          statusText: '409',
          message: JSON.stringify({
            error: 'conflict',
            message: 'Email already registered',
          }),
        })
      }
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }

  async signIn(input: SignInInput, headers?: Headers): Promise<UserResult> {
    try {
      const existing = await this.findByEmail(input.email)
      if (existing && !existing.isActive) {
        throw createError({
          status: 401,
          statusText: '401',
          message: JSON.stringify({
            error: 'account_deactivated',
            message: 'User has been deactivated',
          }),
        })
      }

      const authInstance = await this.resolveAuth()
      const result = await withTimeout(
        authInstance.api.signInEmail({
          body: {
            email: input.email,
            password: input.password,
            rememberMe: input.rememberMe ?? false,
          },
          headers,
        }),
        5_000,
      )

      // FR-023: session_created — fire-and-forget para não atrasar/falhar o
      // login se o registro do evento falhar (auditoria não pode ser crítica).
      // signInEmail retorna apenas o token da sessão (sem o objeto session),
      // então o sessionId é resolvido via validateSession em background.
      const sessionToken = result.token
      void this.validateSession(sessionToken)
        .then((validated) => {
          if (!validated) return
          return createAuthEvent({
            userId: validated.user.id,
            email: validated.user.email,
            eventType: 'session_created',
            metadata: {
              sessionId: validated.session.id,
              userId: validated.user.id,
              tenantId: (validated.session as any)?.activeCompanyId ?? null,
            },
          })
        })
        .catch((error: unknown) => {
          logger.warn('Failed to emit session_created event', {
            error: error instanceof Error ? error.message : String(error),
          })
        })

      return {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        isActive: true,
        createdAt: result.user.createdAt,
        updatedAt: result.user.updatedAt,
      }
    } catch (error: any) {
      if (error instanceof TimeoutError) {
        return handleUpstreamTimeout()
      }
      if (error?.statusCode === 401) {
        throw error
      }
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }

  async findByEmail(email: string): Promise<UserResult | null> {
    try {
      const [found] = await db.select().from(user).where(eq(user.email, email)).limit(1)

      return found || null
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async findById(id: string): Promise<UserResult | null> {
    try {
      const [found] = await db.select().from(user).where(eq(user.id, id)).limit(1)

      return found || null
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async createSession(
    userId: string,
    token: string,
    expiresAt: Date,
    rememberMe: boolean,
  ): Promise<SessionResult> {
    try {
      const [newSession] = await db
        .insert(session)
        .values({ userId, token, expiresAt, rememberMe })
        .returning()

      return newSession!
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async validateSession(token: string): Promise<SessionWithUser | null> {
    try {
      const [found] = await db
        .select()
        .from(session)
        .where(and(eq(session.token, token), gt(session.expiresAt, new Date())))
        .limit(1)

      if (!found) return null

      const [userRecord] = await db.select().from(user).where(eq(user.id, found.userId)).limit(1)

      if (!userRecord || !userRecord.isActive) return null

      return {
        session: found,
        user: userRecord,
      }
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async terminateSession(token: string): Promise<void> {
    try {
      await db.delete(session).where(eq(session.token, token))
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async terminateUserSessions(userId: string): Promise<void> {
    try {
      await db.delete(session).where(eq(session.userId, userId))
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async updateUser(id: string, data: Partial<UpdateUserInput>): Promise<UserResult> {
    try {
      const [updated] = await db
        .update(user)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(user.id, id))
        .returning()

      return updated!
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async isEmailTaken(email: string): Promise<boolean> {
    try {
      const [found] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1)

      return !!found
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async withdrawConsent(userId: string): Promise<UserResult> {
    try {
      // FR-021: retirada de consentimento desativa a conta imediatamente e
      // encerra todas as sessões em uma única transação. A fila de
      // deleção/anonymização fica fora do escopo (pendência #12 parcial).
      return await withTenant(null, userId, async (tx) => {
        await tx.delete(session).where(eq(session.userId, userId))

        const [updated] = await tx
          .update(user)
          .set({ consentWithdrawnAt: new Date(), isActive: false, updatedAt: new Date() })
          .where(eq(user.id, userId))
          .returning()

        return updated!
      })
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async deactivateUser(userId: string): Promise<UserResult> {
    try {
      await db.delete(session).where(eq(session.userId, userId))

      const [updated] = await db
        .update(user)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(user.id, userId))
        .returning()

      return updated!
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async getUserSessions(
    userId: string,
  ): Promise<Array<{ id: string; createdAt: Date; expiresAt: Date }>> {
    try {
      return await db
        .select({ id: session.id, createdAt: session.createdAt, expiresAt: session.expiresAt })
        .from(session)
        .where(eq(session.userId, userId))
    } catch (error) {
      return handleDatabaseError(error)
    }
  }
}

export const identityRepository: IIdentityRepository = new IdentityRepository()

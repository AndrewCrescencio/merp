import { and, desc, eq, gt } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../../db'
import { getAuth } from '#shared/auth'
import type { AuthInstance } from '#shared/auth'
import { logger } from '#shared/logger'
import { authEvent, user, session, verification } from '../../schema'
import { createError, H3Error } from 'h3'
import {
  handleDatabaseError,
  handleUpstreamTimeout,
  sendAuthUnavailableError,
  sendValidationError,
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

// AUD-03: id sintético de 32 chars hex para o caminho de "email já
// registrado" (resposta genérica anti-enumeração) — entropia de 122 bits;
// viés de módulo é irrelevante aqui, então uuid puro basta.
export function generateUserId(): string {
  return randomUUID().replace(/-/g, '')
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

// signInEmail grava o cookie de sessão nos response headers do retorno
// (setSessionCookie). Sem returnHeaders + forwarding, o cookie nunca chega
// ao navegador e nenhuma sessão é estabelecida após o login.
export interface SignInResult extends UserResult {
  setCookie: string[]
}

export interface UpdateUserInput {
  name: string
  isActive: boolean
  consentTermsVersion: string
  consentTermsAcceptedAt: Date
  consentWithdrawnAt: Date
}

// AUD-07: senha-pad do caminho de conta desativada — constante impossível de
// acertar (o verify de scrypt é determinístico), usada para igualar o custo
// de timing do signIn sem jamais criar sessão.
const TIMING_PAD_PASSWORD = '__aud07_timing_pad__'

/** Identity/account repository — Better Auth calls wrapped in 5s timeouts (FR-024) with contract-shaped errors. */
export class IdentityRepository {
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
  /**
   * Registers a user (no session — FR-001) and stamps LGPD consent.
   * Returns null for duplicate emails (anti-enumeration, AUD-03) — never 409.
   */
  async register(input: RegisterInput): Promise<UserResult | null> {
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

      // AUD-03 (anti-enumeração): com autoSignIn=false, o better-auth
      // responde com um usuário sintético (nunca persistido) para email já
      // registrado — hasheando a senha no caminho para igualar o timing.
      // O pós-check detecta o sintético por id inexistente e devolve null;
      // o endpoint responde 201 genérico, sem expor existência de conta.
      const existing = await this.findByEmail(input.email)
      if (existing && existing.id !== createdUser.id) {
        return null
      }

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
      // AUD-03: se a config futura desligar a resposta genérica do
      // better-auth (ex.: requireEmailVerification no fluxo de verificação),
      // email duplicado volta a virar 422 — devolve null, nunca 409.
      if (error?.statusCode === 422) {
        return null
      }
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }

  /**
   * Signs in with timing-equalized paths (AUD-07): deactivated accounts pay
   * the same scrypt cost before 401 `account_deactivated`. Revokes other
   * sessions first (fixation protection). 401 invalid credentials, 403
   * `email_not_verified` (correct password proven), 503 on timeout.
   * The returned `setCookie` must be forwarded or no session is established.
   */
  async signIn(input: SignInInput, headers?: Headers): Promise<UserResult> {
    try {
      const existing = await this.findByEmail(input.email)
      if (existing && !existing.isActive) {
        // AUD-07 (anti-enumeração por timing): conta desativada não passava
        // pelo better-auth — não pagava a query findUserByEmail nem o scrypt
        // (~50-150ms), sendo ~15x mais rápida que os outros caminhos. O pad
        // abaixo replica o custo do caminho de email inexistente (query +
        // verify de scrypt) com a mesma maquinaria do better-auth, antes de
        // lançar o account_deactivated de sempre. A senha-pad é impossível
        // de acertar, então a chamada nunca cria sessão; se mesmo assim
        // resolver (mudança futura de comportamento do better-auth), a
        // sessão vazada é revogada antes do throw — esta branch nunca
        // retorna sucesso.
        const authInstance = await this.resolveAuth()
        await withTimeout(
          authInstance.api.signInEmail({
            body: {
              email: input.email,
              password: TIMING_PAD_PASSWORD,
              rememberMe: false,
            },
            headers,
            returnHeaders: true,
          }),
          5_000,
        )
          .then(async (result: any) => {
            logger.warn('AUD-07: timing pad resolved unexpectedly, revoking session', {
              email: input.email,
            })
            const sessionToken = result?.response?.token
            if (sessionToken) {
              await this.terminateSession(sessionToken)
            }
          })
          .catch(() => {
            // Erro esperado (401 de credenciais inválidas) ou timeout do pad
            // (5s): ambos são engolidos — o account_deactivated abaixo é a
            // única resposta possível desta branch.
          })

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

      // Session fixation protection: revoke all OTHER sessions for this user
      // BEFORE creating the new one, so the new session becomes the only valid one.
      const existingUser = await this.findByEmail(input.email)
      if (existingUser) {
        await this.terminateUserSessions(existingUser.id)
      }

      const result = await withTimeout(
        authInstance.api.signInEmail({
          body: {
            email: input.email,
            password: input.password,
            rememberMe: input.rememberMe ?? false,
          },
          headers,
          returnHeaders: true,
        }),
        5_000,
      )

      // FR-023: session_created — fire-and-forget para não atrasar/falhar o
      // login se o registro do evento falhar (auditoria não pode ser crítica).
      // signInEmail retorna apenas o token da sessão (sem o objeto session),
      // então o sessionId é resolvido via validateSession em background.
      const sessionToken = result.response.token

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
        id: result.response.user.id,
        email: result.response.user.email,
        name: result.response.user.name,
        isActive: true,
        createdAt: result.response.user.createdAt,
        updatedAt: result.response.user.updatedAt,
        setCookie: result.headers?.getSetCookie?.() ?? [],
      }
    } catch (error: any) {
      if (error instanceof TimeoutError) {
        return handleUpstreamTimeout()
      }
      if (error?.statusCode === 401) {
        throw error
      }
      // AUD-04: com requireEmailVerification, o better-auth responde 403
      // email_not_verified — DEPOIS do verify de scrypt da senha (senha
      // correta comprovada), então não vaza existência de conta. Reformatado
      // no padrão JSON do app para o handler de login mapear a razão.
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
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }

  // AUD-04: reenvio do link de verificação. O better-auth responde
  // {status:true} para qualquer email (existente ou não) com piso de 500ms —
  // anti-enumeração embutida; o envio real só ocorre para conta existente
  // não-verificada.
  /** Resends the verification link — identical outcome for any email (anti-enumeration). */
  async sendVerificationEmail(email: string): Promise<void> {
    try {
      const authInstance = await this.resolveAuth()
      await withTimeout(authInstance.api.sendVerificationEmail({ body: { email } }), 5_000)
    } catch (error: any) {
      if (error instanceof TimeoutError) {
        return handleUpstreamTimeout()
      }
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }

  // AUD-04: destino do link de verificação (GET). O token é um JWT assinado
  // com TTL de 1h (expiresIn do emailVerification); idempotente — verificar
  // email já verificado retorna sucesso.
  /** Verifies email ownership via signed JWT (1h TTL, idempotent). 400 on invalid/expired token. */
  async verifyEmail(token: string): Promise<void> {
    try {
      const authInstance = await this.resolveAuth()
      await withTimeout(authInstance.api.verifyEmail({ query: { token } }), 5_000)
    } catch (error: any) {
      if (error instanceof TimeoutError) {
        return handleUpstreamTimeout()
      }
      // Token inválido/expirado (APIError 400/401) → resposta genérica; nada
      // a enumerar: o JWT não é forjável.
      if (error?.statusCode === 400 || error?.statusCode === 401) {
        sendValidationError('Invalid or expired verification link')
      }
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }

  // AUD-04: "esqueci minha senha". Resposta genérica e idêntica para email
  // existente ou não (o better-auth gera o token e simula o lookup no
  // caminho inexistente — anti-enumeração embutida). O redirectTo é a
  // origem do app: o link de reset aponta para GET /api/auth/reset-password/
  // <token>?callbackURL=<origin>, que valida e redireciona para o frontend.
  /** Starts password recovery — identical outcome for any email (anti-enumeration). */
  async requestPasswordReset(email: string): Promise<void> {
    try {
      const authInstance = await this.resolveAuth()
      const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3000'
      await withTimeout(
        authInstance.api.requestPasswordReset({ body: { email, redirectTo: baseURL } }),
        5_000,
      )
    } catch (error: any) {
      if (error instanceof TimeoutError) {
        return handleUpstreamTimeout()
      }
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }

  // AUD-04: define a nova senha com o token de reset. Uso único
  // (consumeVerificationValue do better-auth), TTL de 1h; com
  // revokeSessionsOnPasswordReset, todas as sessões do usuário são
  // revogadas. Token inválido/consumido/expirado → 400 genérico.
  /** Sets a new password via single-use reset token; revokes all sessions. 400 on invalid/consumed/expired token. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const authInstance = await this.resolveAuth()
      await withTimeout(
        authInstance.api.resetPassword({ query: { token }, body: { newPassword } }),
        5_000,
      )
    } catch (error: any) {
      if (error instanceof TimeoutError) {
        return handleUpstreamTimeout()
      }
      if (error?.statusCode === 400) {
        sendValidationError('Invalid or expired reset link')
      }
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }

  // AUD-04: valida o token de reset no clique do link (GET /api/auth/
  // reset-password/<token>). NÃO consome — o consumo de uso único acontece
  // no POST /reset-password. Acoplamento documentado: identifier no formato
  // interno do better-auth (`reset-password:${token}` na tabela verification).
  /** Checks a reset token without consuming it (click-time validation). */
  async validateResetToken(token: string): Promise<boolean> {
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
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  /** Finds a user by email, or null. */
  async findByEmail(email: string): Promise<UserResult | null> {
    try {
      const [found] = await db.select().from(user).where(eq(user.email, email)).limit(1)

      return found || null
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  /** Finds a user by id, or null. */
  async findById(id: string): Promise<UserResult | null> {
    try {
      const [found] = await db.select().from(user).where(eq(user.id, id)).limit(1)

      return found || null
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  /** Persists a session row directly (used by tests/fixtures — handlers use Better Auth sign-in). */
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

  /** Validates a session token (unexpired + active user), or null. */
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

  /** Deletes one session by token. */
  async terminateSession(token: string): Promise<void> {
    try {
      await db.delete(session).where(eq(session.token, token))
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  /** Deletes all sessions of a user. */
  async terminateUserSessions(userId: string): Promise<void> {
    try {
      await db.delete(session).where(eq(session.userId, userId))
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  /** Partially updates a user row (always bumps `updatedAt`). */
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

  /** True when the email is already registered. */
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

  /**
   * Withdraws LGPD consent (FR-021): stamps `consentWithdrawnAt`, deactivates
   * the account and terminates all sessions atomically. The PII
   * deletion/anonymization queue is deferred (out of scope).
   */
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

  /** Deactivates a user (soft delete, FR-017) and terminates all sessions. Data is preserved. */
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

  /** Lists a user's sessions (id + timestamps — no tokens, FR-020 export). */
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

  /**
   * Lists audit events linked to a user, newest first (FR-020 LGPD export).
   * Only rows with `userId` set are returned — events recorded without a
   * user id (e.g. failed logins for unknown emails) never leak into
   * another user's export. Metadata is excluded: it can reference other
   * entities (company ids, invited emails) outside the export scope.
   */
  async listUserAuthEvents(
    userId: string,
  ): Promise<Array<{ id: string; eventType: string; ipAddress: string | null; createdAt: Date }>> {
    try {
      return await db
        .select({
          id: authEvent.id,
          eventType: authEvent.eventType,
          ipAddress: authEvent.ipAddress,
          createdAt: authEvent.createdAt,
        })
        .from(authEvent)
        .where(eq(authEvent.userId, userId))
        .orderBy(desc(authEvent.createdAt))
    } catch (error) {
      return handleDatabaseError(error)
    }
  }
}

export const identityRepository = new IdentityRepository()

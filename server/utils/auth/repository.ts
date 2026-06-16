import { and, eq, gt, or, like } from 'drizzle-orm'
import { db } from '../db'
import { auth } from '#shared/auth'
import { user, session, company, companyMember, authEvent } from '../schema'
import { createError } from 'h3'
import { handleDatabaseError } from './helpers'

export interface CreateAuthEventInput {
  userId?: string | null
  email: string
  eventType: string
  ipAddress?: string | null
  metadata?: Record<string, unknown> | null
}

export interface IAuthRepository {
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
  createCompany(input: CreateCompanyInput): Promise<CompanyResult>
  createCompanyMember(
    companyId: string,
    userId: string,
    role?: string,
  ): Promise<CompanyMemberResult>
  searchCompanies(query: string): Promise<CompanyResult[]>
  findCompanyById(id: string): Promise<CompanyResult | null>
  findUserCompanies(userId: string): Promise<Array<CompanyResult & { role: string }>>
  isCompanyMember(userId: string, companyId: string): Promise<boolean>
  setActiveCompany(sessionId: string, companyId: string | null): Promise<void>
  getActiveCompany(sessionId: string): Promise<string | null>
  createAuthEvent(input: CreateAuthEventInput): Promise<void>
  deactivateUser(userId: string): Promise<UserResult>
  softDeleteCompany(companyId: string): Promise<CompanyResult>
}

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

export interface CreateCompanyInput {
  name: string
  cnpj?: string
  razaoSocial?: string
}

export interface CompanyResult {
  id: string
  name: string
  cnpj: string | null
  razaoSocial: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CompanyMemberResult {
  id: string
  companyId: string
  userId: string
  role: string
  createdAt: Date
}

export class DrizzleAuthRepository implements IAuthRepository {
  async register(input: RegisterInput): Promise<UserResult> {
    try {
      const { user: createdUser } = await auth.api.signUpEmail({
        body: {
          email: input.email,
          password: input.password,
          name: input.name,
          consentTermsVersion: input.consentTermsVersion,
        } as any,
      })

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
      return handleDatabaseError(error)
    }
  }

  async signIn(input: SignInInput, headers?: Headers): Promise<UserResult> {
    try {
      const result = await auth.api.signInEmail({
        body: {
          email: input.email,
          password: input.password,
          rememberMe: input.rememberMe ?? false,
        },
        headers,
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
      if (error?.statusCode === 401) {
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

  async createCompany(input: CreateCompanyInput): Promise<CompanyResult> {
    try {
      const [created] = await db
        .insert(company)
        .values({
          name: input.name,
          cnpj: input.cnpj || null,
          razaoSocial: input.razaoSocial || null,
        })
        .returning()

      return created!
    } catch (error: any) {
      if (error?.code === '23505') {
        throw createError({
          status: 409,
          statusText: '409',
          message: JSON.stringify({
            error: 'conflict',
            message: 'CNPJ already registered',
          }),
        })
      }
      return handleDatabaseError(error)
    }
  }

  async createCompanyMember(
    companyId: string,
    userId: string,
    role = 'member',
  ): Promise<CompanyMemberResult> {
    try {
      const [created] = await db
        .insert(companyMember)
        .values({ companyId, userId, role })
        .returning()

      return created!
    } catch (error: any) {
      if (error?.code === '23505') {
        throw createError({
          status: 409,
          statusText: '409',
          message: JSON.stringify({
            error: 'conflict',
            message: 'User is already a member of this company',
          }),
        })
      }
      return handleDatabaseError(error)
    }
  }

  async searchCompanies(query: string): Promise<CompanyResult[]> {
    try {
      const pattern = `%${query}%`
      return await db
        .select()
        .from(company)
        .where(
          and(
            eq(company.isDeleted, false),
            or(like(company.name, pattern), like(company.cnpj, pattern)),
          ),
        )
        .limit(20)
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async findCompanyById(id: string): Promise<CompanyResult | null> {
    try {
      const [found] = await db
        .select()
        .from(company)
        .where(and(eq(company.id, id), eq(company.isDeleted, false)))
        .limit(1)

      return found || null
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async findUserCompanies(userId: string): Promise<Array<CompanyResult & { role: string }>> {
    try {
      return await db
        .select({
          id: company.id,
          name: company.name,
          cnpj: company.cnpj,
          razaoSocial: company.razaoSocial,
          isDeleted: company.isDeleted,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
          role: companyMember.role,
        })
        .from(companyMember)
        .innerJoin(company, eq(companyMember.companyId, company.id))
        .where(and(eq(companyMember.userId, userId), eq(company.isDeleted, false)))
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async isCompanyMember(userId: string, companyId: string): Promise<boolean> {
    try {
      const [found] = await db
        .select({ id: companyMember.id })
        .from(companyMember)
        .where(and(eq(companyMember.userId, userId), eq(companyMember.companyId, companyId)))
        .limit(1)

      return !!found
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async setActiveCompany(sessionId: string, companyId: string | null): Promise<void> {
    try {
      await db
        .update(session)
        .set({ activeCompanyId: companyId, updatedAt: new Date() })
        .where(eq(session.id, sessionId))
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async getActiveCompany(sessionId: string): Promise<string | null> {
    try {
      const [found] = await db
        .select({ activeCompanyId: session.activeCompanyId })
        .from(session)
        .where(eq(session.id, sessionId))
        .limit(1)

      return found?.activeCompanyId || null
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

  async softDeleteCompany(companyId: string): Promise<CompanyResult> {
    try {
      await db.delete(companyMember).where(eq(companyMember.companyId, companyId))

      const [updated] = await db
        .update(company)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(eq(company.id, companyId))
        .returning()

      return updated!
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async createAuthEvent(input: CreateAuthEventInput): Promise<void> {
    try {
      await db.insert(authEvent).values({
        userId: input.userId || null,
        email: input.email,
        eventType: input.eventType,
        ipAddress: input.ipAddress || null,
        metadata: (input.metadata as Record<string, unknown>) || null,
      })
    } catch (error) {
      return handleDatabaseError(error)
    }
  }
}

export const authRepository: IAuthRepository = new DrizzleAuthRepository()

import { and, desc, eq, gt } from 'drizzle-orm'
import { db } from '../../db'
import { user, session, authEvent, verification } from '../../schema'
import { handleDatabaseError } from '../../shared/errors'

export interface UserResult {
  id: string
  email: string
  name: string | null
  isActive: boolean
  consentWithdrawnAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface UpdateUserInput {
  name: string
  isActive: boolean
  consentTermsVersion: string
  consentTermsAcceptedAt: Date
  consentWithdrawnAt: Date
}

export class UserRepository {
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

  async deactivateUser(userId: string): Promise<UserResult> {
    try {
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

  async withdrawConsent(userId: string): Promise<UserResult> {
    try {
      const [updated] = await db
        .update(user)
        .set({ isActive: false, consentWithdrawnAt: new Date(), updatedAt: new Date() })
        .where(eq(user.id, userId))
        .returning()
      return updated!
    } catch (error) {
      return handleDatabaseError(error)
    }
  }
}

export const userRepository = new UserRepository()

import { and, eq, gt } from "drizzle-orm";
import { db } from "../db";
import { auth } from "#shared/auth";
import { user, session } from "../schema";
import { createError } from "h3";
import { handleDatabaseError } from "./helpers";

export interface IAuthRepository {
  register(input: RegisterInput): Promise<UserResult>;
  signIn(input: SignInInput, headers?: Headers): Promise<UserResult>;
  findByEmail(email: string): Promise<UserResult | null>;
  findById(id: string): Promise<UserResult | null>;
  createSession(userId: string, token: string, expiresAt: Date, rememberMe: boolean): Promise<SessionResult>;
  validateSession(token: string): Promise<SessionWithUser | null>;
  terminateSession(token: string): Promise<void>;
  terminateUserSessions(userId: string): Promise<void>;
  updateUser(id: string, data: Partial<UpdateUserInput>): Promise<UserResult>;
  isEmailTaken(email: string): Promise<boolean>;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface SignInInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface UserResult {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionResult {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  rememberMe: boolean;
  createdAt: Date;
}

export interface SessionWithUser {
  session: SessionResult;
  user: UserResult;
}

export interface UpdateUserInput {
  name: string;
  isActive: boolean;
  consentTermsVersion: string;
  consentTermsAcceptedAt: Date;
  consentWithdrawnAt: Date;
}

export class DrizzleAuthRepository implements IAuthRepository {
  async register(input: RegisterInput): Promise<UserResult> {
    try {
      const { user } = await auth.api.signUpEmail({
        body: {
          email: input.email,
          password: input.password,
          name: input.name,
        },
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        isActive: true,
        createdAt: user.createdAt,
        updatedAt: user.createdAt,
      };
    } catch (error: any) {
      if (error?.statusCode === 409 || error?.message?.includes?.("already")) {
        throw createError({
          status: 409,
          statusText: "409",
          message: JSON.stringify({
            error: "conflict",
            message: "Email already registered",
          }),
        });
      }
      return handleDatabaseError(error);
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
      });
      return {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        isActive: true,
        createdAt: result.user.createdAt,
        updatedAt: result.user.updatedAt,
      };
    } catch (error: any) {
      if (error?.statusCode === 401) {
        throw error;
      }
      return handleDatabaseError(error);
    }
  }

  async findByEmail(email: string): Promise<UserResult | null> {
    try {
      const [found] = await db
        .select()
        .from(user)
        .where(eq(user.email, email))
        .limit(1);

      return found || null;
    } catch (error) {
      return handleDatabaseError(error);
    }
  }

  async findById(id: string): Promise<UserResult | null> {
    try {
      const [found] = await db
        .select()
        .from(user)
        .where(eq(user.id, id))
        .limit(1);

      return found || null;
    } catch (error) {
      return handleDatabaseError(error);
    }
  }

  async createSession(userId: string, token: string, expiresAt: Date, rememberMe: boolean): Promise<SessionResult> {
    try {
      const [newSession] = await db
        .insert(session)
        .values({ userId, token, expiresAt, rememberMe })
        .returning();

      return newSession!;
    } catch (error) {
      return handleDatabaseError(error);
    }
  }

  async validateSession(token: string): Promise<SessionWithUser | null> {
    try {
      const [found] = await db
        .select()
        .from(session)
        .where(and(eq(session.token, token), gt(session.expiresAt, new Date())))
        .limit(1);

      if (!found) return null;

      const [userRecord] = await db
        .select()
        .from(user)
        .where(eq(user.id, found.userId))
        .limit(1);

      if (!userRecord || !userRecord.isActive) return null;

      return {
        session: found,
        user: userRecord,
      };
    } catch (error) {
      return handleDatabaseError(error);
    }
  }

  async terminateSession(token: string): Promise<void> {
    try {
      await db.delete(session).where(eq(session.token, token));
    } catch (error) {
      return handleDatabaseError(error);
    }
  }

  async terminateUserSessions(userId: string): Promise<void> {
    try {
      await db.delete(session).where(eq(session.userId, userId));
    } catch (error) {
      return handleDatabaseError(error);
    }
  }

  async updateUser(id: string, data: Partial<UpdateUserInput>): Promise<UserResult> {
    try {
      const [updated] = await db
        .update(user)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(user.id, id))
        .returning();

      return updated!;
    } catch (error) {
      return handleDatabaseError(error);
    }
  }

  async isEmailTaken(email: string): Promise<boolean> {
    try {
      const [found] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);

      return !!found;
    } catch (error) {
      return handleDatabaseError(error);
    }
  }

}

export const authRepository: IAuthRepository = new DrizzleAuthRepository();

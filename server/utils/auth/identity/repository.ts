import { sessionRepository } from './session'
import { userRepository } from './user'
import {
  registerUser,
  signInUser,
  sendVerificationEmailBA,
  verifyEmailBA,
  requestPasswordResetBA,
  resetPasswordBA,
  withdrawConsentBA,
  deactivateUserBA,
} from './queries'
import type { SignInInput, UpdateUserInput } from './queries'
import type { RegisterInput } from '../../shared/validate'
import type { UserResult, SignInResult } from './user'
import { generateUserId } from './queries'

export class IdentityRepository {
  async register(input: RegisterInput): Promise<UserResult | null> {
    return registerUser(input, await (await import('#shared/auth')).getAuth())
  }

  async signIn(input: SignInInput, headers?: Headers): Promise<SignInResult> {
    return signInUser(input, headers)
  }

  async sendVerificationEmail(email: string): Promise<void> {
    return sendVerificationEmailBA(email)
  }

  async verifyEmail(token: string): Promise<void> {
    return verifyEmailBA(token)
  }

  async requestPasswordReset(email: string): Promise<void> {
    return requestPasswordResetBA(email)
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    return resetPasswordBA(token, newPassword)
  }

  async validateResetToken(token: string): Promise<boolean> {
    return userRepository.validateResetToken(token)
  }

  async findByEmail(email: string): Promise<UserResult | null> {
    return userRepository.findByEmail(email)
  }

  async findById(id: string): Promise<UserResult | null> {
    return userRepository.findById(id)
  }

  async createSession(
    userId: string,
    token: string,
    expiresAt: Date,
    rememberMe: boolean,
  ): Promise<import('./session').SessionResult> {
    return sessionRepository.createSession(userId, token, expiresAt, rememberMe)
  }

  async validateSession(token: string): Promise<import('./session').SessionWithUser | null> {
    return sessionRepository.validateSession(token)
  }

  async terminateSession(token: string): Promise<void> {
    return sessionRepository.terminateSession(token)
  }

  async terminateUserSessions(userId: string): Promise<void> {
    return sessionRepository.terminateUserSessions(userId)
  }

  async updateUser(id: string, data: Partial<UpdateUserInput>): Promise<UserResult> {
    return userRepository.updateUser(id, data)
  }

  async isEmailTaken(email: string): Promise<boolean> {
    return userRepository.isEmailTaken(email)
  }

  async withdrawConsent(userId: string): Promise<UserResult> {
    return withdrawConsentBA(userId)
  }

  async deactivateUser(userId: string): Promise<UserResult> {
    return deactivateUserBA(userId)
  }

  async getUserSessions(
    userId: string,
  ): Promise<Array<{ id: string; createdAt: Date; expiresAt: Date }>> {
    return userRepository.getUserSessions(userId)
  }

  async listUserAuthEvents(
    userId: string,
  ): Promise<Array<{ id: string; eventType: string; ipAddress: string | null; createdAt: Date }>> {
    return userRepository.listUserAuthEvents(userId)
  }
}

export const identityRepository = new IdentityRepository()

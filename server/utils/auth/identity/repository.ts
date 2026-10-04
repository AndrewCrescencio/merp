import { sessionRepository } from './session'
import { userRepository } from './user'
import type { SignInInput, UpdateUserInput } from './queries'
import type { RegisterInput } from '../../shared/validate'
import type { UserResult, SignInResult } from './user'
import { generateUserId } from './queries'

export class IdentityRepository {
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
    return userRepository.withdrawConsent(userId)
  }

  async deactivateUser(userId: string): Promise<UserResult> {
    return userRepository.deactivateUser(userId)
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

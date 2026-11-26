import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { membershipRepository } from '~~/server/utils/companies/company/membership'
import { callBetterAuth } from '~~/server/utils/auth/identity/client'
import { listUserAuthEvents } from '~~/server/utils/auth/identity/queries'
import { checkExportRateLimit } from '~~/server/utils/shared/security'
import handler from './index.get'

vi.mock('~~/server/utils/companies/company/membership', () => ({
  membershipRepository: { findUserCompanies: vi.fn() },
}))
vi.mock('~~/server/utils/auth/identity/client', () => ({ callBetterAuth: vi.fn() }))
vi.mock('~~/server/utils/auth/identity/queries', () => ({ listUserAuthEvents: vi.fn() }))
vi.mock('~~/server/utils/shared/security', () => ({ checkExportRateLimit: vi.fn() }))

const findUserCompanies = vi.mocked(membershipRepository.findUserCompanies)
const userAuthEvents = vi.mocked(listUserAuthEvents)
const betterAuth = vi.mocked(callBetterAuth)

const user = { id: 'user-1', email: 'user@example.com', name: 'Context name' }
const createdAt = new Date('2026-01-01T00:00:00Z')
const event = {
  context: { user, session: { id: 'session-1' } },
  headers: new Headers(),
} as H3Event

const authEvent = {
  id: 'event-1',
  userId: user.id,
  email: user.email,
  eventType: 'session_created',
  ipAddress: '192.0.2.1',
  metadata: { sessionId: 'session-1' },
  createdAt,
}

describe('GET /api/v1/me/data-export', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('exports the profile and public fields of companies and auth events', async () => {
    betterAuth.mockResolvedValue({
      session: { id: 'session-1', token: 'session-token' },
      user: { ...user, email: 'session@example.com', name: 'Session name', createdAt },
    })
    findUserCompanies.mockResolvedValue([
      {
        id: 'company-1',
        name: 'Company 1',
        role: 'owner',
        isDeleted: false,
        createdAt,
        updatedAt: createdAt,
      },
    ])
    userAuthEvents.mockResolvedValue([authEvent])

    await expect(handler(event)).resolves.toStrictEqual({
      profile: { id: user.id, email: user.email, name: 'Session name', createdAt },
      companies: [{ id: 'company-1', name: 'Company 1', role: 'owner' }],
      sessions: [],
      authEvents: [
        { id: 'event-1', eventType: 'session_created', ipAddress: '192.0.2.1', createdAt },
      ],
    })
    expect(findUserCompanies).toHaveBeenCalledWith(user.id)
    expect(userAuthEvents).toHaveBeenCalledWith(user.id)
    expect(checkExportRateLimit).toHaveBeenCalledWith(event, user.id)
  })

  it('applies export limit before fetching any data', async () => {
    vi.mocked(checkExportRateLimit).mockRejectedValueOnce(new Error('limited'))

    await expect(handler(event)).rejects.toThrow('limited')
    expect(betterAuth).not.toHaveBeenCalled()
    expect(findUserCompanies).not.toHaveBeenCalled()
    expect(userAuthEvents).not.toHaveBeenCalled()
  })

  it('falls back to the authenticated profile when session details are absent', async () => {
    betterAuth.mockResolvedValue(null)
    findUserCompanies.mockResolvedValue([])
    userAuthEvents.mockResolvedValue([{ ...authEvent, ipAddress: null, metadata: null }])

    await expect(handler(event)).resolves.toStrictEqual({
      profile: { ...user, createdAt: undefined },
      companies: [],
      sessions: [],
      authEvents: [{ id: 'event-1', eventType: 'session_created', ipAddress: null, createdAt }],
    })
  })
})

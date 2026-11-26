import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { membershipRepository } from '~~/server/utils/companies/company/membership'
import { callBetterAuth } from '~~/server/utils/auth/identity/client'
import { listUserAuthEvents, listUserAuthEventsPage } from '~~/server/utils/auth/identity/queries'
import { checkExportRateLimit } from '~~/server/utils/shared/security'
import handler from './index.get'

vi.mock('~~/server/utils/companies/company/membership', () => ({
  membershipRepository: { findUserCompanies: vi.fn() },
}))
vi.mock('~~/server/utils/auth/identity/client', () => ({ callBetterAuth: vi.fn() }))
vi.mock('~~/server/utils/auth/identity/queries', () => ({
  listUserAuthEvents: vi.fn(),
  listUserAuthEventsPage: vi.fn(),
}))
vi.mock('~~/server/utils/shared/security', () => ({ checkExportRateLimit: vi.fn() }))

const findUserCompanies = vi.mocked(membershipRepository.findUserCompanies)
const userAuthEvents = vi.mocked(listUserAuthEvents)
const userAuthEventsPage = vi.mocked(listUserAuthEventsPage)
const betterAuth = vi.mocked(callBetterAuth)

const user = { id: 'user-1', email: 'user@example.com', name: 'Context name' }
const createdAt = new Date('2026-01-01T00:00:00Z')
const path = '/api/v1/me/data-export'

function createEvent(query?: string): H3Event {
  return {
    context: { user, session: { id: 'session-1' } },
    headers: new Headers(),
    path: query ? `${path}?${query}` : path,
  } as H3Event
}

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

    const event = createEvent()
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
    expect(userAuthEventsPage).not.toHaveBeenCalled()
    expect(checkExportRateLimit).toHaveBeenCalledWith(event, user.id)
  })

  it.each([undefined, 'limit=1'])(
    'applies export limit before fetching any data with query %s',
    async (query) => {
      vi.mocked(checkExportRateLimit).mockRejectedValueOnce(new Error('limited'))

      await expect(handler(createEvent(query))).rejects.toThrow('limited')
      expect(betterAuth).not.toHaveBeenCalled()
      expect(findUserCompanies).not.toHaveBeenCalled()
      expect(userAuthEvents).not.toHaveBeenCalled()
      expect(userAuthEventsPage).not.toHaveBeenCalled()
    },
  )

  it('falls back to the authenticated profile when session details are absent', async () => {
    betterAuth.mockResolvedValue(null)
    findUserCompanies.mockResolvedValue([])
    userAuthEvents.mockResolvedValue([{ ...authEvent, ipAddress: null, metadata: null }])

    await expect(handler(createEvent())).resolves.toStrictEqual({
      profile: { ...user, createdAt: undefined },
      companies: [],
      sessions: [],
      authEvents: [{ id: 'event-1', eventType: 'session_created', ipAddress: null, createdAt }],
    })
  })

  it('returns a cursor and reuses its full precision and cutoff on the next page', async () => {
    const position = {
      cutoff: '2026-01-02T00:00:00.000001Z',
      createdAt: '2026-01-01T00:00:00.000009Z',
      id: authEvent.id,
    }
    betterAuth.mockResolvedValue(null)
    findUserCompanies.mockResolvedValue([])
    userAuthEventsPage
      .mockResolvedValueOnce({
        events: [
          { ...authEvent, cursorCreatedAt: position.createdAt, cursorCutoff: position.cutoff },
        ],
        next: position,
      })
      .mockResolvedValueOnce({ events: [], next: null })

    const result = await handler(createEvent('limit=1'))

    expect(result.authEvents).toStrictEqual([
      { id: 'event-1', eventType: 'session_created', ipAddress: '192.0.2.1', createdAt },
    ])
    const cursor = result.authEventsPagination?.nextCursor
    expect(cursor).toBeTypeOf('string')
    expect(userAuthEventsPage).toHaveBeenNthCalledWith(1, user.id, 1, undefined)

    await expect(handler(createEvent(`cursor=${cursor}&limit=1`))).resolves.toMatchObject({
      authEvents: [],
      authEventsPagination: { nextCursor: null },
    })
    expect(userAuthEventsPage).toHaveBeenNthCalledWith(2, user.id, 1, position)
    expect(userAuthEvents).not.toHaveBeenCalled()
  })

  it.each(['limit=501', 'limit=0', 'limit=1&limit=2', 'cursor=invalid'])(
    'rejects invalid pagination options %s before fetching data',
    async (query) => {
      await expect(handler(createEvent(query))).rejects.toMatchObject({
        statusCode: 400,
      })
      expect(betterAuth).not.toHaveBeenCalled()
      expect(userAuthEvents).not.toHaveBeenCalled()
      expect(userAuthEventsPage).not.toHaveBeenCalled()
    },
  )
})

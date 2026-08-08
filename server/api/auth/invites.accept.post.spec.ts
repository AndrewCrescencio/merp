import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindPendingInvite = vi.fn()
const mockAcceptInvite = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockReadBody = vi.fn()
const mockGetRequestIP = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
  getRequestIP: mockGetRequestIP,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/auth/invite/repository', () => ({
  inviteRepository: {
    findPendingInvite: mockFindPendingInvite,
    acceptInvite: mockAcceptInvite,
  },
}))

vi.mock('~~/server/utils/shared/audit', () => ({
  createAuthEvent: mockCreateAuthEvent,
}))

vi.mock('~~/server/utils/shared/errors', () => ({
  sendValidationError: (msg: string) => {
    throw new Error(msg)
  },
  sendNotFoundError: (msg: string) => {
    throw new Error(msg)
  },
}))

const eventWithUser = () =>
  ({ context: { user: { id: 'user-1', email: 'invitee@example.com' } } }) as any

describe('POST /api/auth/invites/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRequestIP.mockReturnValue('127.0.0.1')
  })

  it('requires authentication', async () => {
    const handler = await import('~~/server/api/auth/invites.accept.post').then((m) => m.default)
    await expect(handler({ context: {} } as any)).rejects.toThrow('Authentication required.')
  })

  it('validates companyId is required', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await import('~~/server/api/auth/invites.accept.post').then((m) => m.default)
    await expect(handler(eventWithUser())).rejects.toThrow('companyId is required')
  })

  it('rejects when no pending invite for session email', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1' })
    mockFindPendingInvite.mockResolvedValue(null)

    const handler = await import('~~/server/api/auth/invites.accept.post').then((m) => m.default)
    await expect(handler(eventWithUser())).rejects.toThrow('Invite not found or expired')

    expect(mockFindPendingInvite).toHaveBeenCalledWith('company-1', 'invitee@example.com')
    expect(mockAcceptInvite).not.toHaveBeenCalled()
  })

  it('uses session email, never the body, when accepting', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1', email: 'attacker@example.com' })
    mockFindPendingInvite.mockResolvedValue({
      id: 'invite-1',
      companyId: 'company-1',
      email: 'invitee@example.com',
    })
    mockAcceptInvite.mockResolvedValue({
      id: 'invite-1',
      companyId: 'company-1',
      acceptedAt: new Date('2026-08-01T00:00:00Z'),
    })

    const handler = await import('~~/server/api/auth/invites.accept.post').then((m) => m.default)
    const result = await handler(eventWithUser())

    expect(mockAcceptInvite).toHaveBeenCalledWith('company-1', 'invitee@example.com', 'user-1')
    expect(mockCreateAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'invite_accepted',
        metadata: { companyId: 'company-1' },
      }),
    )
    expect(result).toEqual({
      id: 'invite-1',
      companyId: 'company-1',
      acceptedAt: expect.any(Date),
    })
  })
})

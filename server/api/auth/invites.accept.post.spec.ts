import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAcceptInvite = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockReadBody = vi.fn()
const mockGetClientIp = vi.fn()
const mockSendUnauthorizedError = vi.fn()
const mockSendValidationError = vi.fn()
const mockCheckIpRateLimit = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/shared', () => ({
  createAuthEvent: mockCreateAuthEvent,
  getClientIp: mockGetClientIp,
  sendUnauthorizedError: mockSendUnauthorizedError,
  sendValidationError: mockSendValidationError,
  checkIpRateLimit: mockCheckIpRateLimit,
  validateInviteAcceptInput: (body: any) => {
    if (!body?.token || typeof body.token !== 'string' || body.token.length === 0) {
      throw new Error('token is required')
    }
    return { token: body.token }
  },
}))

vi.mock('~~/server/utils/auth/invite/repository', () => ({
  inviteRepository: {
    acceptInvite: mockAcceptInvite,
  },
}))

const eventWithUser = (user: Record<string, unknown> = {}) =>
  ({ context: { user: { id: 'user-1', email: 'invitee@example.com', ...user } } }) as any

describe('POST /api/auth/invites/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetClientIp.mockReturnValue('127.0.0.1')
    mockCheckIpRateLimit.mockResolvedValue(undefined)
    mockSendUnauthorizedError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
  })

  it('requires authentication', async () => {
    const handler = await import('~~/server/api/auth/invites.accept.post').then((m) => m.default)
    await expect(handler({ context: {} } as any)).rejects.toThrow('Authentication required.')
  })

  it('validates token is required', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await import('~~/server/api/auth/invites.accept.post').then((m) => m.default)
    await expect(handler(eventWithUser())).rejects.toThrow('token is required')
    expect(mockAcceptInvite).not.toHaveBeenCalled()
  })

  it('uses the session email, never the body, when accepting', async () => {
    mockReadBody.mockResolvedValue({ token: 'tok-1', email: 'attacker@example.com' })
    mockAcceptInvite.mockResolvedValue({
      id: 'invite-1',
      companyId: 'company-1',
      acceptedAt: new Date('2026-08-01T00:00:00Z'),
    })

    const handler = await import('~~/server/api/auth/invites.accept.post').then((m) => m.default)
    const result = await handler(eventWithUser())

    expect(mockAcceptInvite).toHaveBeenCalledWith('tok-1', 'invitee@example.com', 'user-1')
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

  it('propagates rejection for invalid, expired or already-used tokens', async () => {
    mockReadBody.mockResolvedValue({ token: 'bad-token' })
    mockAcceptInvite.mockRejectedValue(new Error('Invite not found or expired'))

    const handler = await import('~~/server/api/auth/invites.accept.post').then((m) => m.default)
    await expect(handler(eventWithUser())).rejects.toThrow('Invite not found or expired')
    expect(mockCreateAuthEvent).not.toHaveBeenCalled()
  })
})

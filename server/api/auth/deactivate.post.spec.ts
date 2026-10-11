import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDeactivateUser = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockGetClientIp = vi.fn()
const mockSendUnauthorizedError = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
}))
vi.mock('~~/server/utils/shared/ip', () => ({
  getClientIp: mockGetClientIp,
}))
vi.mock('~~/server/utils/shared/errors', () => ({
  sendUnauthorizedError: mockSendUnauthorizedError,
}))
vi.mock('~~/server/utils/shared/audit', () => ({
  createAuthEvent: mockCreateAuthEvent,
}))
vi.mock('~~/server/utils/auth/identity/queries', () => ({
  deactivateUser: mockDeactivateUser,
}))

describe('POST /api/auth/deactivate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendUnauthorizedError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    // FR-017: o soft delete precisa acontecer de fato — antes só se revogava
    // sessão e a conta continuava logável.
    mockDeactivateUser.mockResolvedValue({ id: 'user-1', isActive: false })
  })

  it('deactivates the user and returns success', async () => {
    const handler = await import('~~/server/api/auth/deactivate.post').then((m) => m.default)

    const event = {
      context: { user: { id: 'user-1', email: 'test@example.com' } },
      headers: new Headers(),
    } as any

    const result = await handler(event)

    expect(result).toEqual({ message: 'Account deactivated successfully' })
    expect(mockDeactivateUser).toHaveBeenCalledWith('user-1')
  })

  it('returns 401 when user is not authenticated', async () => {
    const handler = await import('~~/server/api/auth/deactivate.post').then((m) => m.default)

    await expect(handler({ context: {} } as any)).rejects.toThrow('Authentication required.')
    expect(mockDeactivateUser).not.toHaveBeenCalled()
  })

  it('emits session_invalidated with the session context and then deactivation', async () => {
    const handler = await import('~~/server/api/auth/deactivate.post').then((m) => m.default)

    const event = {
      context: {
        user: { id: 'user-1', email: 'test@example.com' },
        session: { id: 'session-1', activeCompanyId: 'company-1' },
      },
      headers: new Headers(),
    } as any

    await handler(event)

    expect(mockCreateAuthEvent).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      email: 'test@example.com',
      eventType: 'session_invalidated',
      ipAddress: null,
      metadata: { sessionId: 'session-1', userId: 'user-1', tenantId: 'company-1' },
    })
    expect(mockCreateAuthEvent).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      email: 'test@example.com',
      eventType: 'deactivation',
    })
  })
})

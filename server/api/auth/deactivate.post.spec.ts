import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDeactivateUser = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockGetRequestIP = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getRequestIP: mockGetRequestIP,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/auth/identity/repository', () => ({
  identityRepository: {
    deactivateUser: mockDeactivateUser,
  },
}))

vi.mock('~~/server/utils/shared/audit', () => ({
  createAuthEvent: mockCreateAuthEvent,
}))

describe('POST /api/auth/deactivate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deactivates user and returns success', async () => {
    mockDeactivateUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const handler = await import('~~/server/api/auth/deactivate.post').then((m) => m.default)

    const event = {
      context: { user: { id: 'user-1', email: 'user@example.com' } },
      headers: new Headers(),
    } as any

    const result = await handler(event)

    expect(result).toEqual({ message: 'Account deactivated successfully' })
    expect(mockDeactivateUser).toHaveBeenCalledWith('user-1')
  })

  it('logs deactivation event after successful deactivation', async () => {
    mockDeactivateUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const handler = await import('~~/server/api/auth/deactivate.post').then((m) => m.default)

    const event = {
      context: { user: { id: 'user-1', email: 'user@example.com' } },
      headers: new Headers(),
    } as any

    await handler(event)

    expect(mockCreateAuthEvent).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      eventType: 'deactivation',
      ipAddress: null,
    })
  })

  it('emits session_invalidated event after deactivation', async () => {
    mockDeactivateUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const handler = await import('~~/server/api/auth/deactivate.post').then((m) => m.default)

    const event = {
      context: {
        user: { id: 'user-1', email: 'user@example.com' },
        session: { id: 'session-123', activeCompanyId: 'company-1' },
      },
      headers: new Headers(),
    } as any

    await handler(event)

    expect(mockCreateAuthEvent).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      eventType: 'session_invalidated',
      ipAddress: null,
      metadata: {
        sessionId: 'session-123',
        userId: 'user-1',
        tenantId: 'company-1',
      },
    })
  })

  it('emits session_invalidated with null sessionId when context session missing', async () => {
    mockDeactivateUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const handler = await import('~~/server/api/auth/deactivate.post').then((m) => m.default)

    const event = {
      context: { user: { id: 'user-1', email: 'user@example.com' } },
      headers: new Headers(),
    } as any

    await handler(event)

    expect(mockCreateAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'session_invalidated',
        metadata: expect.objectContaining({ sessionId: null }),
      }),
    )
  })

  it('throws 401 when user is not authenticated', async () => {
    const handler = await import('~~/server/api/auth/deactivate.post').then((m) => m.default)

    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockDeactivateUser).not.toHaveBeenCalled()
  })
})

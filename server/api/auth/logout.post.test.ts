import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSignOut = vi.fn()
const mockSendUnauthorizedError = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('#shared/auth', () => ({
  auth: { api: { signOut: mockSignOut } },
}))

vi.mock('~~/server/utils/auth/helpers', () => ({
  sendUnauthorizedError: mockSendUnauthorizedError,
}))

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendUnauthorizedError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
  })

  it('returns 200 with success message on logout', async () => {
    const handler = await import('~~/server/api/auth/logout.post').then((m) => m.default)
    mockSignOut.mockResolvedValue({})

    const event = {
      context: {
        session: { id: 'session-123' },
      },
      headers: new Headers(),
    } as any

    const result = await handler(event)

    expect(result).toEqual({ message: 'Logged out successfully' })
    expect(mockSignOut).toHaveBeenCalledWith({
      headers: event.headers,
    })
  })

  it('returns 401 when no active session exists', async () => {
    const handler = await import('~~/server/api/auth/logout.post').then((m) => m.default)

    const event = {
      context: {},
      headers: new Headers(),
    } as any

    await expect(handler(event)).rejects.toThrow('No active session.')
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('returns 401 when session is undefined', async () => {
    const handler = await import('~~/server/api/auth/logout.post').then((m) => m.default)

    const event = {
      context: { session: undefined },
      headers: new Headers(),
    } as any

    await expect(handler(event)).rejects.toThrow('No active session.')
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('calls signOut with event headers', async () => {
    const handler = await import('~~/server/api/auth/logout.post').then((m) => m.default)
    mockSignOut.mockResolvedValue({})

    const headers = new Headers({ cookie: 'merp-session_token=abc123' })
    const event = {
      context: { session: { id: 'session-123' } },
      headers,
    } as any

    await handler(event)

    expect(mockSignOut).toHaveBeenCalledWith({ headers })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRequestURL = vi.fn()
const mockLoggerInfo = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getRequestURL: (...args: any[]) => mockGetRequestURL(...args),
}))

vi.mock('#shared/logger', () => ({
  logger: { info: mockLoggerInfo },
}))

describe('PII audit middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips non-PII endpoints', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/login'))

    const handler = await import('~~/server/middleware/pii-audit').then((m) => m.default)

    const event = { context: {} } as any
    await handler(event)

    expect(mockLoggerInfo).not.toHaveBeenCalled()
  })

  it('logs pii_access for GET /api/auth/me', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/me'))

    const handler = await import('~~/server/middleware/pii-audit').then((m) => m.default)

    const event = {
      context: {
        user: { id: 'user-1', email: 'user@example.com', name: 'Test User' },
      },
    } as any

    await handler(event)

    expect(mockLoggerInfo).toHaveBeenCalledWith('pii_access', {
      event: 'pii_access',
      userId: 'user-1',
      email: 'user@example.com',
      path: '/api/auth/me',
      purpose: 'session_check',
      timestamp: expect.any(String),
    })
  })

  it('logs pii_access for /api/auth/export', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/export'))

    const handler = await import('~~/server/middleware/pii-audit').then((m) => m.default)

    const event = {
      context: {
        user: { id: 'user-1', email: 'user@example.com', name: 'Test User' },
      },
    } as any

    await handler(event)

    expect(mockLoggerInfo).toHaveBeenCalledWith('pii_access', {
      event: 'pii_access',
      userId: 'user-1',
      email: 'user@example.com',
      path: '/api/auth/export',
      purpose: 'data_export',
      timestamp: expect.any(String),
    })
  })

  it('does not log when user is not authenticated', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/me'))

    const handler = await import('~~/server/middleware/pii-audit').then((m) => m.default)

    const event = { context: {} } as any
    await handler(event)

    expect(mockLoggerInfo).not.toHaveBeenCalled()
  })

  it('does not log when user is undefined', async () => {
    mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/auth/me'))

    const handler = await import('~~/server/middleware/pii-audit').then((m) => m.default)

    const event = { context: { user: undefined } } as any
    await handler(event)

    expect(mockLoggerInfo).not.toHaveBeenCalled()
  })
})

import { vi } from 'vitest'
import type { H3Event } from 'h3'
import { createError, type Headers } from 'h3'

export function createMockEvent(overrides: Partial<H3Event> = {}): H3Event {
  return {
    context: { user: undefined, session: undefined, tenantId: null, userId: null },
    headers: new Headers(),
    ...overrides,
  } as H3Event
}

export function mockAuthUser(user = { id: 'uuid', email: 'test@example.com', name: 'Test' }) {
  return {
    context: {
      user,
      session: { id: 'session-id' },
      tenantId: null,
      userId: user.id,
    },
  }
}

export function createRateLimitError(retryAfter = 30) {
  const err: any = new Error(
    JSON.stringify({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Try again later.',
      retryAfter,
    }),
  )
  err.status = 429
  err.statusCode = 429
  return err
}

export function createAuthError(status: number, error: string, message: string) {
  const err: any = new Error(JSON.stringify({ error, message }))
  err.status = status
  err.statusCode = status
  return err
}

export const mockRateLimitPass = () => vi.fn().mockResolvedValue(undefined)
export const mockRateLimitFail = (retryAfter = 30) =>
  vi.fn().mockRejectedValue(createRateLimitError(retryAfter))

export function mockRepositoryMethod<T>(mock: ReturnType<typeof vi.fn>, value: T) {
  mock.mockResolvedValue(value)
  return mock
}

export function mockRepositoryError<T>(mock: ReturnType<typeof vi.fn>, error: Error) {
  mock.mockRejectedValue(error)
  return mock
}

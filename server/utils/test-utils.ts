import { vi } from 'vitest'
import type { H3Event, type Headers } from 'h3'

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
  const err = new Error(
    JSON.stringify({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Try again later.',
      retryAfter,
    }),
  ) as Error & { status: number; statusCode: number }
  err.status = 429
  err.statusCode = 429
  return err
}

export function createAuthError(status: number, error: string, message: string) {
  const err = new Error(JSON.stringify({ error, message })) as Error & {
    status: number
    statusCode: number
  }
  err.status = status
  err.statusCode = status
  return err
}

export const mockRateLimitPass = () => vi.fn().mockResolvedValue(undefined)
export const mockRateLimitFail = (retryAfter = 30) =>
  vi.fn().mockRejectedValue(createRateLimitError(retryAfter))

export function mockRepositoryMethod(mock: ReturnType<typeof vi.fn>, value: unknown) {
  mock.mockResolvedValue(value)
  return mock
}

export function mockRepositoryError(mock: ReturnType<typeof vi.fn>, error: Error) {
  mock.mockRejectedValue(error)
  return mock
}

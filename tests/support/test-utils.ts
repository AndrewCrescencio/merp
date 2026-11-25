import type { H3Event } from 'h3'

export function createMockEvent(overrides: Partial<H3Event> = {}): H3Event {
  return {
    context: { user: undefined, session: undefined, tenantId: null, userId: null },
    headers: new Headers(),
    ...overrides,
  } as H3Event
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

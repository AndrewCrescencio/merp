import { describe, it, expect, vi } from 'vitest'

vi.mock('~~/server/utils/db', () => ({
  db: { execute: vi.fn() },
}))

vi.mock('#shared/auth', () => ({
  isAuthAvailable: vi.fn(),
}))

describe('GET /api/health/live', () => {
  it('always returns 200 regardless of dependencies', async () => {
    const event = { node: { res: { statusCode: 200 } } } as any
    const handler = await import('~~/server/api/health/live.get').then((m) => m.default)

    const result = await handler(event)

    expect(result).toEqual({ status: 'ok' })
  })
})

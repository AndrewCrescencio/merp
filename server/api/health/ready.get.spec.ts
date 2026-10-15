import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIsAuthAvailable = vi.fn()
const mockDbExecute = vi.fn()

vi.mock('#shared/auth', () => ({
  isAuthAvailable: mockIsAuthAvailable,
}))

vi.mock('~~/server/utils/db', () => ({
  db: { execute: mockDbExecute },
}))

function createEvent() {
  const event = { node: { res: { statusCode: 200 } } } as any
  return event
}

describe('GET /api/health/ready', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuthAvailable.mockResolvedValue(true)
    mockDbExecute.mockResolvedValue([{ '?column?': 1 }])
  })

  it('returns 200 when auth and db are available', async () => {
    const handler = await import('~~/server/api/health/ready.get').then((m) => m.default)
    const event = createEvent()

    const result = await handler(event)

    expect(event.node.res.statusCode).toBe(200)
    expect(result).toEqual({ status: 'ok', auth: 'ready', db: 'ok' })
  })

  it('returns 503 when the database is unavailable', async () => {
    mockDbExecute.mockRejectedValue(new Error('connection refused'))
    const handler = await import('~~/server/api/health/ready.get').then((m) => m.default)
    const event = createEvent()

    const result = await handler(event)

    expect(event.node.res.statusCode).toBe(503)
    expect(result).toEqual({ status: 'unavailable', auth: 'ready', db: 'unavailable' })
  })
})

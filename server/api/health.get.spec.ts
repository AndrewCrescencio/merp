import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIsAuthAvailable = vi.fn()
const mockDbExecute = vi.fn()

vi.mock('#shared/auth', () => ({
  isAuthAvailable: mockIsAuthAvailable,
}))

vi.mock('~~/server/utils/db', () => ({
  db: { execute: mockDbExecute },
}))

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuthAvailable.mockResolvedValue(true)
    mockDbExecute.mockResolvedValue([{ '?column?': 1 }])
  })

  it('reports auth ready and db ok when both are available', async () => {
    const handler = await import('~~/server/api/health.get').then((m) => m.default)

    const result = await handler({} as any)

    expect(result).toEqual({ status: 'ok', auth: 'ready', db: 'ok' })
  })

  it('reports auth unavailable when auth initialization fails', async () => {
    mockIsAuthAvailable.mockResolvedValue(false)

    const handler = await import('~~/server/api/health.get').then((m) => m.default)

    const result = await handler({} as any)

    expect(result).toEqual({ status: 'ok', auth: 'unavailable', db: 'ok' })
  })

  it('reports db unavailable when the database check fails', async () => {
    mockDbExecute.mockRejectedValue(new Error('connection refused'))

    const handler = await import('~~/server/api/health.get').then((m) => m.default)

    const result = await handler({} as any)

    expect(result).toEqual({ status: 'ok', auth: 'ready', db: 'unavailable' })
  })

  it('reports both unavailable when auth and db fail', async () => {
    mockIsAuthAvailable.mockResolvedValue(false)
    mockDbExecute.mockRejectedValue(new Error('connection refused'))

    const handler = await import('~~/server/api/health.get').then((m) => m.default)

    const result = await handler({} as any)

    expect(result).toEqual({ status: 'ok', auth: 'unavailable', db: 'unavailable' })
  })
})

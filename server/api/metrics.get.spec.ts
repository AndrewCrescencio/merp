import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIsAuthAvailable = vi.fn()
const mockDbExecute = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  setResponseHeaders: vi.fn(),
}))

vi.mock('#shared/auth', () => ({
  isAuthAvailable: mockIsAuthAvailable,
}))

vi.mock('~~/server/utils/db', () => ({
  db: { execute: mockDbExecute },
}))

describe('GET /api/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuthAvailable.mockResolvedValue(true)
    mockDbExecute.mockResolvedValue(undefined)
  })

  it('exposes readiness gauges in Prometheus text format without PII', async () => {
    const handler = await import('~~/server/api/metrics.get').then((m) => m.default)

    const result = await handler({} as any)

    expect(result).toContain('merp_auth_ready 1')
    expect(result).toContain('merp_db_ready 1')
    expect(result).toContain('merp_process_uptime_seconds')
    expect(result).toContain('merp_process_heap_used_bytes')
    expect(result).not.toMatch(/@/)
  })

  it('reports 0 gauges instead of failing when dependencies are down', async () => {
    mockIsAuthAvailable.mockResolvedValue(false)
    mockDbExecute.mockRejectedValue(new Error('db down'))

    const handler = await import('~~/server/api/metrics.get').then((m) => m.default)

    const result = await handler({} as any)

    expect(result).toContain('merp_auth_ready 0')
    expect(result).toContain('merp_db_ready 0')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSearchCompanies = vi.fn()
const mockGetQuery = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getQuery: (...args: any[]) => mockGetQuery(...args),
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/shared/security', () => ({
  checkUserRateLimit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('~~/server/utils/auth/company/membership', () => ({
  membershipRepository: {
    searchCompanies: mockSearchCompanies,
  },
}))

describe('GET /api/v1/companies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires authentication', async () => {
    const handler = await import('~~/server/api/v1/companies/index.get').then((m) => m.default)
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
  })

  it('validates search query is required', async () => {
    mockGetQuery.mockReturnValue({})

    const handler = await import('~~/server/api/v1/companies/index.get').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' }, session: { id: 's1' } } } as any

    await expect(handler(event)).rejects.toThrow('Search query is required')
    expect(mockSearchCompanies).not.toHaveBeenCalled()
  })

  it('AUD-14: rejects oversized search queries', async () => {
    mockGetQuery.mockReturnValue({ q: 'x'.repeat(200) })

    const handler = await import('~~/server/api/v1/companies/index.get').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' }, session: { id: 's1' } } } as any

    await expect(handler(event)).rejects.toThrow('Search query must be at most 100 characters')
    expect(mockSearchCompanies).not.toHaveBeenCalled()
  })

  it('returns matching companies', async () => {
    mockGetQuery.mockReturnValue({ q: 'Test' })
    mockSearchCompanies.mockResolvedValue([
      { id: 'c1', name: 'Test Company', cnpj: '12345678901234' },
    ])

    const handler = await import('~~/server/api/v1/companies/index.get').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' }, session: { id: 's1' } } } as any

    const result = await handler(event)

    expect(mockSearchCompanies).toHaveBeenCalledWith('Test', 'user-1')
    expect(result).toEqual({
      companies: [{ id: 'c1', name: 'Test Company', cnpj: '12345678901234' }],
    })
  })

  it('returns empty array when no matches', async () => {
    mockGetQuery.mockReturnValue({ q: 'Nonexistent' })
    mockSearchCompanies.mockResolvedValue([])

    const handler = await import('~~/server/api/v1/companies/index.get').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' }, session: { id: 's1' } } } as any

    const result = await handler(event)

    expect(result).toEqual({ companies: [] })
  })
})

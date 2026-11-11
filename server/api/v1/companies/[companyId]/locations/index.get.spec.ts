import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListLocations = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/auth/company/location-repository', () => ({
  locationRepository: { listLocations: mockListLocations },
}))

describe('GET /api/v1/companies/{companyId}/locations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const authContext = {
    user: { id: 'user-1', email: 'a@b.c', name: null },
    session: { id: 'session-1' },
    tenant: { companyId: 'company-1', role: 'member' },
  }

  const loadHandler = () =>
    import('~~/server/api/v1/companies/[companyId]/locations/index.get').then((m) => m.default)

  it('requires authentication', async () => {
    mockListLocations.mockImplementation(() => {
      throw new Error('Authentication required.')
    })

    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockListLocations).not.toHaveBeenCalled()
  })

  it('lists locations of the tenant company (companyId do tenant, não do corpo)', async () => {
    const locations = [
      { id: 'loc-1', name: 'Matriz', isActive: true },
      { id: 'loc-2', name: 'Filial', isActive: true },
    ]
    mockListLocations.mockResolvedValue(locations)

    const handler = await loadHandler()
    const event = { context: authContext } as any

    const result = await handler(event)

    expect(mockListLocations).toHaveBeenCalledWith('company-1', 'user-1')
    expect(result).toEqual({ locations })
  })
})

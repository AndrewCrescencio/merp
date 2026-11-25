import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReadBody = vi.fn()
const mockSetResponseStatus = vi.fn()
const mockSetHeader = vi.fn()
const mockCreateLocation = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
  setResponseStatus: mockSetResponseStatus,
  setHeader: mockSetHeader,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/auth/company/location-repository', () => ({
  locationRepository: { createLocation: mockCreateLocation },
}))

describe('POST /api/v1/companies/{companyId}/locations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const authContext = (role = 'owner') => ({
    user: { id: 'user-1', email: 'a@b.c', name: null },
    session: { id: 'session-1' },
    tenant: { companyId: 'company-1', role },
  })

  const loadHandler = () =>
    import('~~/server/api/v1/companies/[companyId]/locations/index.post').then((m) => m.default)

  it('requires authentication', async () => {
    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockCreateLocation).not.toHaveBeenCalled()
  })

  it('403 quando o papel do tenant nao e owner', async () => {
    mockReadBody.mockResolvedValue({ name: 'Filial' })

    const handler = await loadHandler()
    const event = { context: authContext('member') } as any

    await expect(handler(event)).rejects.toThrow('Only company owners can create locations')
    expect(mockReadBody).not.toHaveBeenCalled()
    expect(mockCreateLocation).not.toHaveBeenCalled()
  })

  it('400 quando o body nao passa validacao', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await loadHandler()
    const event = { context: authContext() } as any

    await expect(handler(event)).rejects.toThrow(
      'name is required and must be a string of at most 200 characters',
    )
    expect(mockCreateLocation).not.toHaveBeenCalled()
  })

  it('cria location da company do tenant (companyId vem do path/tenant, nao do body)', async () => {
    const created = {
      id: 'loc-1',
      companyId: 'company-1',
      name: 'Filial Zona Sul',
      isActive: true,
    }
    mockReadBody.mockResolvedValue({ name: 'Filial Zona Sul' })
    mockCreateLocation.mockResolvedValue(created)

    const handler = await loadHandler()
    const event = { context: authContext() } as any

    const result = await handler(event)

    expect(mockCreateLocation).toHaveBeenCalledWith('company-1', 'user-1', {
      name: 'Filial Zona Sul',
    })
    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 201)
    expect(mockSetHeader).toHaveBeenCalledWith(
      event,
      'Location',
      '/api/v1/companies/company-1/locations/loc-1',
    )
    expect(result).toEqual(created)
  })
})

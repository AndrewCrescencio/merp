import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRouterParam = vi.fn()
const mockReadBody = vi.fn()
const mockUpdateLocation = vi.fn()
const mockAssertRole = vi.fn()
const mockSendNotFoundError = vi.fn()
const mockSendValidationError = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getRouterParam: mockGetRouterParam,
  readBody: mockReadBody,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/auth/company/location-repository', () => ({
  locationRepository: { updateLocation: mockUpdateLocation },
}))

vi.mock('~~/server/utils/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/shared')>()
  return {
    ...actual,
    assertRole: mockAssertRole,
    ROLES: { owner: 'owner', member: 'member' },
    sendNotFoundError: mockSendNotFoundError,
    sendValidationError: mockSendValidationError,
  }
})

describe('PATCH /api/v1/companies/{companyId}/locations/{locationId}', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendNotFoundError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockAssertRole.mockImplementation(() => undefined)
  })

  const authContext = (role = 'owner') => ({
    user: { id: 'user-1', email: 'a@b.c', name: null },
    session: { id: 'session-1' },
    tenant: { companyId: 'company-1', role },
  })

  const loadHandler = () =>
    import('~~/server/api/v1/companies/[companyId]/locations/[locationId]/index.patch').then(
      (m) => m.default,
    )

  it('requires authentication', async () => {
    mockAssertRole.mockImplementation(() => {
      throw new Error('Authentication required.')
    })
    mockGetRouterParam.mockReturnValue('loc-1')

    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockUpdateLocation).not.toHaveBeenCalled()
  })

  it('403 quando o papel do tenant nao e owner', async () => {
    mockAssertRole.mockImplementation((_role, requiredRole, _m1, m2) => {
      if (_role !== requiredRole) throw new Error(m2)
    })
    mockGetRouterParam.mockReturnValue('loc-1')

    const handler = await loadHandler()
    const event = { context: authContext('member') } as any

    await expect(handler(event)).rejects.toThrow('Only company owners can update locations')
    expect(mockUpdateLocation).not.toHaveBeenCalled()
  })

  it('400 quando o body nao passa validacao', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await loadHandler()
    const event = { context: authContext() } as any

    await expect(handler(event)).rejects.toThrow('name or isActive is required')
    expect(mockUpdateLocation).not.toHaveBeenCalled()
  })

  it('404 quando o locationId do path nao vem', async () => {
    mockGetRouterParam.mockReturnValue(undefined)

    const handler = await loadHandler()
    const event = { context: authContext() } as any

    await expect(handler(event)).rejects.toThrow('Location not found')
    expect(mockUpdateLocation).not.toHaveBeenCalled()
  })

  it('404 quando a location nao existe na company do tenant', async () => {
    mockGetRouterParam.mockReturnValue('loc-1')
    mockReadBody.mockResolvedValue({ name: 'X' })
    mockUpdateLocation.mockImplementation(() => {
      throw new Error('Location not found')
    })

    const handler = await loadHandler()
    const event = { context: authContext() } as any

    await expect(handler(event)).rejects.toThrow('Location not found')
    expect(mockUpdateLocation).toHaveBeenCalledWith('company-1', 'user-1', 'loc-1', { name: 'X' })
  })

  it('renomeia a location da company do tenant (companyId do path/tenant)', async () => {
    const updated = { id: 'loc-1', companyId: 'company-1', name: 'Filial Renomeada' }
    mockGetRouterParam.mockReturnValue('loc-1')
    mockReadBody.mockResolvedValue({ name: 'Filial Renomeada' })
    mockUpdateLocation.mockResolvedValue(updated)

    const handler = await loadHandler()
    const event = { context: authContext() } as any

    const result = await handler(event)

    expect(mockUpdateLocation).toHaveBeenCalledWith('company-1', 'user-1', 'loc-1', {
      name: 'Filial Renomeada',
    })
    expect(result).toEqual(updated)
  })
})

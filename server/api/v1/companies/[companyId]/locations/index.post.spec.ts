import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReadBody = vi.fn()
const mockSetResponseStatus = vi.fn()
const mockSetHeader = vi.fn()
const mockRequireTenant = vi.fn()
const mockRequireUser = vi.fn()
const mockCreateLocation = vi.fn()
const mockAssertRole = vi.fn()
const mockSendValidationError = vi.fn()

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

vi.mock('~~/server/utils/shared/auth-context', () => ({
  requireTenant: mockRequireTenant,
  requireUser: mockRequireUser,
}))

vi.mock('~~/server/utils/auth/company/location-repository', () => ({
  locationRepository: { createLocation: mockCreateLocation },
}))

vi.mock('~~/server/utils/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/shared')>()
  return {
    ...actual,
    assertRole: mockAssertRole,
    ROLES: { owner: 'owner', member: 'member' },
    sendValidationError: mockSendValidationError,
  }
})

describe('POST /api/v1/companies/{companyId}/locations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockAssertRole.mockImplementation(() => undefined)
  })

  const loadHandler = () =>
    import('~~/server/api/v1/companies/[companyId]/locations/index.post').then((m) => m.default)

  it('requires authentication', async () => {
    mockRequireUser.mockImplementation(() => {
      throw new Error('Authentication required.')
    })
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })

    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockCreateLocation).not.toHaveBeenCalled()
  })

  it('403 quando o papel do tenant nao e owner', async () => {
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'member' })
    mockRequireUser.mockReturnValue({ id: 'user-1' })
    mockAssertRole.mockImplementation((_role, requiredRole, _m1, m2) => {
      if (_role !== requiredRole) throw new Error(m2)
    })
    mockReadBody.mockResolvedValue({ name: 'Filial' })

    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Only company owners can create locations')
    expect(mockAssertRole).toHaveBeenCalledWith(
      'member',
      'owner',
      expect.any(String),
      'Only company owners can create locations',
    )
    expect(mockCreateLocation).not.toHaveBeenCalled()
  })

  it('400 quando o body nao passa validacao', async () => {
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })
    mockRequireUser.mockReturnValue({ id: 'user-1' })
    mockReadBody.mockResolvedValue({})

    const handler = await loadHandler()
    const event = { context: {} } as any

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
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })
    mockRequireUser.mockReturnValue({ id: 'user-1' })
    mockReadBody.mockResolvedValue({ name: 'Filial Zona Sul' })
    mockCreateLocation.mockResolvedValue(created)

    const handler = await loadHandler()
    const event = { context: {} } as any

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

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRouterParam = vi.fn()
const mockRequireTenant = vi.fn()
const mockRequireUser = vi.fn()
const mockSoftDeleteLocation = vi.fn()
const mockAssertRole = vi.fn()
const mockSendNotFoundError = vi.fn()
const mockSendNoContent = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getRouterParam: mockGetRouterParam,
  sendNoContent: mockSendNoContent,
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
  locationRepository: { softDeleteLocation: mockSoftDeleteLocation },
}))

vi.mock('~~/server/utils/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/shared')>()
  return {
    ...actual,
    assertRole: mockAssertRole,
    ROLES: { owner: 'owner', member: 'member' },
    sendNotFoundError: mockSendNotFoundError,
  }
})

describe('DELETE /api/v1/companies/{companyId}/locations/{locationId}', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendNotFoundError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockAssertRole.mockImplementation(() => undefined)
  })

  const loadHandler = () =>
    import('~~/server/api/v1/companies/[companyId]/locations/[locationId]/index.delete').then(
      (m) => m.default,
    )

  it('requires authentication', async () => {
    mockRequireUser.mockImplementation(() => {
      throw new Error('Authentication required.')
    })
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })
    mockGetRouterParam.mockReturnValue('loc-1')

    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockSoftDeleteLocation).not.toHaveBeenCalled()
  })

  it('403 quando o papel do tenant nao e owner', async () => {
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'member' })
    mockRequireUser.mockReturnValue({ id: 'user-1' })
    mockAssertRole.mockImplementation((_role, requiredRole, _m1, m2) => {
      if (_role !== requiredRole) throw new Error(m2)
    })
    mockGetRouterParam.mockReturnValue('loc-1')

    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Only company owners can delete locations')
    expect(mockSoftDeleteLocation).not.toHaveBeenCalled()
  })

  it('404 quando o locationId do path nao vem', async () => {
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })
    mockRequireUser.mockReturnValue({ id: 'user-1' })
    mockGetRouterParam.mockReturnValue(undefined)

    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Location not found')
    expect(mockSoftDeleteLocation).not.toHaveBeenCalled()
  })

  it('404 quando a location nao existe na company do tenant', async () => {
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })
    mockRequireUser.mockReturnValue({ id: 'user-1' })
    mockGetRouterParam.mockReturnValue('loc-1')
    mockSoftDeleteLocation.mockImplementation(() => {
      throw new Error('Location not found')
    })

    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Location not found')
    expect(mockSoftDeleteLocation).toHaveBeenCalledWith('company-1', 'user-1', 'loc-1')
  })

  it('soft-delete: 204 sem corpo (companyId do tenant, nao do corpo)', async () => {
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })
    mockRequireUser.mockReturnValue({ id: 'user-1' })
    mockGetRouterParam.mockReturnValue('loc-1')
    mockSoftDeleteLocation.mockResolvedValue(undefined)
    mockSendNoContent.mockImplementation(() => undefined)

    const handler = await loadHandler()
    const event = { context: {} } as any

    const result = await handler(event)

    expect(mockSoftDeleteLocation).toHaveBeenCalledWith('company-1', 'user-1', 'loc-1')
    expect(mockSendNoContent).toHaveBeenCalledWith(event)
    expect(result).toBeUndefined()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRouterParam = vi.fn()
const mockReadBody = vi.fn()
const mockRequireTenant = vi.fn()
const mockSendUnauthorizedError = vi.fn()
const mockSetMemberDefaultLocation = vi.fn()
const mockAssertRole = vi.fn()
const mockSendNotFoundError = vi.fn()
const mockSendValidationError = vi.fn()
const mockCreateAuthEvent = vi.fn()

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

vi.mock('~~/server/utils/shared/auth-context', () => ({
  requireTenant: mockRequireTenant,
}))

vi.mock('~~/server/utils/auth/company/membership', () => ({
  membershipRepository: { setMemberDefaultLocation: mockSetMemberDefaultLocation },
}))

vi.mock('~~/server/utils/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/shared')>()
  return {
    ...actual,
    assertRole: mockAssertRole,
    ROLES: { owner: 'owner', member: 'member' },
    sendNotFoundError: mockSendNotFoundError,
    sendValidationError: mockSendValidationError,
    sendUnauthorizedError: mockSendUnauthorizedError,
    createAuthEvent: mockCreateAuthEvent,
  }
})

describe('PATCH /api/v1/companies/{companyId}/members/{userId}/default-location', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendUnauthorizedError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockSendNotFoundError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockAssertRole.mockImplementation(() => undefined)
  })

  const loadHandler = () =>
    import('~~/server/api/v1/companies/[companyId]/members/[userId]/default-location.patch').then(
      (m) => m.default,
    )

  const eventWithUser = (tenant: { companyId: string; role: string }) =>
    ({
      context: {
        user: { id: 'user-1', email: 'a@b.c' },
        tenant,
      },
    }) as any

  it('requires authentication', async () => {
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })
    mockGetRouterParam.mockReturnValue('target-user')

    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockSetMemberDefaultLocation).not.toHaveBeenCalled()
  })

  it('403 quando o papel do tenant nao e owner', async () => {
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'member' })
    mockAssertRole.mockImplementation((_role, requiredRole, _m1, m2) => {
      if (_role !== requiredRole) throw new Error(m2)
    })
    mockReadBody.mockResolvedValue({ defaultLocationId: 'loc-1' })

    const handler = await loadHandler()
    const event = eventWithUser({ companyId: 'company-1', role: 'member' })
    mockGetRouterParam.mockReturnValue('target-user')

    await expect(handler(event)).rejects.toThrow(
      'Only company owners can assign a default location',
    )
    expect(mockAssertRole).toHaveBeenCalledWith(
      'member',
      'owner',
      expect.any(String),
      'Only company owners can assign a default location',
    )
    expect(mockSetMemberDefaultLocation).not.toHaveBeenCalled()
  })

  it('400 quando o body nao passa validacao', async () => {
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })
    mockReadBody.mockResolvedValue({})

    const handler = await loadHandler()
    const event = eventWithUser({ companyId: 'company-1', role: 'owner' })
    mockGetRouterParam.mockReturnValue('target-user')

    await expect(handler(event)).rejects.toThrow('defaultLocationId must be a location id or null')
    expect(mockSetMemberDefaultLocation).not.toHaveBeenCalled()
  })

  it('404 quando o userId do path nao vem', async () => {
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })
    mockReadBody.mockResolvedValue({ defaultLocationId: 'loc-1' })
    mockGetRouterParam.mockReturnValue(undefined)

    const handler = await loadHandler()
    const event = eventWithUser({ companyId: 'company-1', role: 'owner' })

    await expect(handler(event)).rejects.toThrow('Company member not found')
    expect(mockSetMemberDefaultLocation).not.toHaveBeenCalled()
  })

  it('404 quando o membro ou a location nao existem na company do tenant', async () => {
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })
    mockGetRouterParam.mockReturnValue('target-user')
    mockReadBody.mockResolvedValue({ defaultLocationId: 'loc-1' })
    mockSetMemberDefaultLocation.mockImplementation(() => {
      throw new Error('Company member not found')
    })

    const handler = await loadHandler()
    const event = eventWithUser({ companyId: 'company-1', role: 'owner' })

    await expect(handler(event)).rejects.toThrow('Company member not found')
    expect(mockSetMemberDefaultLocation).toHaveBeenCalledWith(
      'company-1',
      'user-1',
      'target-user',
      'loc-1',
    )
  })

  it('atribui a loja padrao do membro da company do tenant (companyId e userId do path)', async () => {
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })
    mockGetRouterParam.mockReturnValue('target-user')
    mockReadBody.mockResolvedValue({ defaultLocationId: 'loc-1' })
    mockSetMemberDefaultLocation.mockResolvedValue(undefined)
    mockCreateAuthEvent.mockResolvedValue(undefined)

    const handler = await loadHandler()
    const event = eventWithUser({ companyId: 'company-1', role: 'owner' })

    const result = await handler(event)

    expect(mockSetMemberDefaultLocation).toHaveBeenCalledWith(
      'company-1',
      'user-1',
      'target-user',
      'loc-1',
    )
    expect(mockCreateAuthEvent).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'a@b.c',
      eventType: 'member_default_location_updated',
      ipAddress: null,
      metadata: {
        companyId: 'company-1',
        targetUserId: 'target-user',
        defaultLocationId: 'loc-1',
      },
    })
    expect(result).toEqual({ message: 'Default location updated successfully' })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRouterParam = vi.fn()
const mockReadBody = vi.fn()
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
    createAuthEvent: mockCreateAuthEvent,
  }
})

describe('PATCH /api/v1/companies/{companyId}/members/{userId}/default-location', () => {
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
    import('~~/server/api/v1/companies/[companyId]/members/[userId]/default-location.patch').then(
      (m) => m.default,
    )

  it('requires authentication', async () => {
    mockAssertRole.mockImplementation(() => {
      throw new Error('Authentication required.')
    })
    mockGetRouterParam.mockReturnValue('target-user')

    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockSetMemberDefaultLocation).not.toHaveBeenCalled()
  })

  it('403 quando o papel do tenant nao e owner', async () => {
    mockAssertRole.mockImplementation((_role, requiredRole, _m1, m2) => {
      if (_role !== requiredRole) throw new Error(m2)
    })
    mockReadBody.mockResolvedValue({ defaultLocationId: 'loc-1' })

    const handler = await loadHandler()
    const event = { context: authContext('member') } as any

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
    mockReadBody.mockResolvedValue({})

    const handler = await loadHandler()
    const event = { context: authContext() } as any

    await expect(handler(event)).rejects.toThrow('defaultLocationId must be a location id or null')
    expect(mockSetMemberDefaultLocation).not.toHaveBeenCalled()
  })

  it('404 quando o userId do path nao vem', async () => {
    mockReadBody.mockResolvedValue({ defaultLocationId: 'loc-1' })
    mockGetRouterParam.mockReturnValue(undefined)

    const handler = await loadHandler()
    const event = { context: authContext() } as any

    await expect(handler(event)).rejects.toThrow('Company member not found')
    expect(mockSetMemberDefaultLocation).not.toHaveBeenCalled()
  })

  it('404 quando o membro ou a location nao existem na company do tenant', async () => {
    mockGetRouterParam.mockReturnValue('target-user')
    mockReadBody.mockResolvedValue({ defaultLocationId: 'loc-1' })
    mockSetMemberDefaultLocation.mockImplementation(() => {
      throw new Error('Company member not found')
    })

    const handler = await loadHandler()
    const event = { context: authContext() } as any

    await expect(handler(event)).rejects.toThrow('Company member not found')
    expect(mockSetMemberDefaultLocation).toHaveBeenCalledWith(
      'company-1',
      'user-1',
      'target-user',
      'loc-1',
    )
  })

  it('atribui a loja padrao do membro da company do tenant (companyId e userId do path)', async () => {
    mockGetRouterParam.mockReturnValue('target-user')
    mockReadBody.mockResolvedValue({ defaultLocationId: 'loc-1' })
    mockSetMemberDefaultLocation.mockResolvedValue(undefined)
    mockCreateAuthEvent.mockResolvedValue(undefined)

    const handler = await loadHandler()
    const event = { context: authContext() } as any

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

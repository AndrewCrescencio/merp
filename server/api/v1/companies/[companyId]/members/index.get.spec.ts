import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListCompanyMembers = vi.fn()
const mockRequireTenant = vi.fn()
const mockRequireUser = vi.fn()
const mockAssertRole = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
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

vi.mock('~~/server/utils/auth/company/membership', () => ({
  membershipRepository: { listCompanyMembers: mockListCompanyMembers },
}))

vi.mock('~~/server/utils/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/shared')>()
  return {
    ...actual,
    assertRole: mockAssertRole,
    ROLES: { owner: 'owner', member: 'member' },
  }
})

describe('GET /api/v1/companies/{companyId}/members', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertRole.mockImplementation(() => undefined)
  })

  const loadHandler = () =>
    import('~~/server/api/v1/companies/[companyId]/members/index.get').then((m) => m.default)

  it('requires authentication', async () => {
    mockRequireUser.mockImplementation(() => {
      throw new Error('Authentication required.')
    })
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })

    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockListCompanyMembers).not.toHaveBeenCalled()
  })

  it('403 quando o papel do tenant nao e owner (apenas owner lista membros)', async () => {
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'member' })
    mockRequireUser.mockReturnValue({ id: 'user-1' })
    mockAssertRole.mockImplementation((_role, requiredRole, _m1, m2) => {
      if (_role !== requiredRole) throw new Error(m2)
    })

    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Only company owners can list members')
    expect(mockListCompanyMembers).not.toHaveBeenCalled()
  })

  it('lista membros da company do tenant (companyId vem do tenant, nao do corpo)', async () => {
    const members = [
      { userId: 'user-1', name: 'Dona', role: 'owner', defaultLocationId: null },
      { userId: 'user-2', name: 'Membro', role: 'member', defaultLocationId: null },
    ]
    mockRequireTenant.mockReturnValue({ companyId: 'company-1', role: 'owner' })
    mockRequireUser.mockReturnValue({ id: 'user-1', email: 'a@b.c' })
    mockListCompanyMembers.mockResolvedValue(members)

    const handler = await loadHandler()
    const event = { context: {} } as any

    const result = await handler(event)

    expect(mockListCompanyMembers).toHaveBeenCalledWith('company-1', 'user-1')
    expect(result).toEqual({ members })
  })
})

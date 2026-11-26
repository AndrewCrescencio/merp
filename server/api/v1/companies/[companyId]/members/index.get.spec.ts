import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListCompanyMembers = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/companies/company/membership', () => ({
  membershipRepository: { listCompanyMembers: mockListCompanyMembers },
}))

describe('GET /api/v1/companies/{companyId}/members', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const authContext = (role = 'owner') => ({
    user: { id: 'user-1', email: 'a@b.c', name: null },
    session: { id: 'session-1' },
    tenant: { companyId: 'company-1', role },
  })

  const loadHandler = () =>
    import('~~/server/api/v1/companies/[companyId]/members/index.get').then((m) => m.default)

  it('requires authentication', async () => {
    const handler = await loadHandler()
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockListCompanyMembers).not.toHaveBeenCalled()
  })

  it('403 quando o papel do tenant nao e owner (apenas owner lista membros)', async () => {
    const handler = await loadHandler()
    const event = { context: authContext('member') } as any

    await expect(handler(event)).rejects.toThrow('Only company owners can list members')
    expect(mockListCompanyMembers).not.toHaveBeenCalled()
  })

  it('lista membros da company do tenant (companyId vem do tenant, nao do corpo)', async () => {
    const members = [
      { userId: 'user-1', name: 'Dona', role: 'owner', defaultLocationId: null },
      { userId: 'user-2', name: 'Membro', role: 'member', defaultLocationId: null },
    ]
    mockListCompanyMembers.mockResolvedValue(members)

    const handler = await loadHandler()
    const event = { context: authContext() } as any

    const result = await handler(event)

    expect(mockListCompanyMembers).toHaveBeenCalledWith('company-1', 'user-1')
    expect(result).toEqual({ members })
  })
})

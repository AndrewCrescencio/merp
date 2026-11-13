import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListCompanyInvites = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/auth/invite/repository', () => ({
  inviteRepository: { listCompanyInvites: mockListCompanyInvites },
}))

const authContext = (role: string | null) => ({
  user: { id: 'user-1', email: 'a@b.c', name: null },
  session: { id: 'session-1' },
  tenant: { companyId: 'company-1', role },
})

describe('GET /api/v1/companies/{companyId}/invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListCompanyInvites.mockResolvedValue([])
  })

  const loadHandler = () =>
    import('~~/server/api/v1/companies/[companyId]/invitations/index.get').then((m) => m.default)

  it('requires authentication', async () => {
    const handler = await loadHandler()
    await expect(handler({ context: {} } as any)).rejects.toThrow('Authentication required.')
    expect(mockListCompanyInvites).not.toHaveBeenCalled()
  })

  it('rejects when the tenant has no membership role', async () => {
    const handler = await loadHandler()
    await expect(handler({ context: authContext(null) } as any)).rejects.toThrow(
      'You are not a member of this company',
    )
    expect(mockListCompanyInvites).not.toHaveBeenCalled()
  })

  it('lists invites of the tenant company for a member', async () => {
    mockListCompanyInvites.mockResolvedValue([{ id: 'inv-1' }])

    const handler = await loadHandler()
    const result = await handler({ context: authContext('member') } as any)

    expect(result).toEqual({ invites: [{ id: 'inv-1' }] })
    expect(mockListCompanyInvites).toHaveBeenCalledWith('company-1')
  })

  it('regression: owner keeps listing invites (any-member check)', async () => {
    const handler = await loadHandler()
    const result = await handler({ context: authContext('owner') } as any)

    expect(result).toEqual({ invites: [] })
  })
})

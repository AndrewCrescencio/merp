import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindCompanyById = vi.fn()
const mockGetCompanyMembershipRole = vi.fn()
const mockListCompanyInvites = vi.fn()
const mockGetQuery = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getQuery: mockGetQuery,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/auth/company/repository', () => ({
  companyRepository: { findCompanyById: mockFindCompanyById },
}))

vi.mock('~~/server/utils/auth/company/membership', () => ({
  membershipRepository: { getCompanyMembershipRole: mockGetCompanyMembershipRole },
}))

vi.mock('~~/server/utils/auth/invite/repository', () => ({
  inviteRepository: { listCompanyInvites: mockListCompanyInvites },
}))

const authContext = {
  user: { id: 'user-1', email: 'a@b.c', name: null },
  session: { id: 'session-1' },
}

describe('GET /api/v1/me/invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({ companyId: 'company-1' })
    mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Co' })
    mockGetCompanyMembershipRole.mockResolvedValue('member')
    mockListCompanyInvites.mockResolvedValue([])
  })

  const loadHandler = () =>
    import('~~/server/api/v1/me/invitations/index.get').then((m) => m.default)

  it('requires authentication', async () => {
    const handler = await loadHandler()
    await expect(handler({ context: {} } as any)).rejects.toThrow('Authentication required.')
  })

  it('validates companyId is required', async () => {
    mockGetQuery.mockReturnValue({})

    const handler = await loadHandler()

    await expect(handler({ context: authContext } as any)).rejects.toThrow('companyId is required')
  })

  it('rejects when company does not exist', async () => {
    mockFindCompanyById.mockResolvedValue(null)

    const handler = await loadHandler()

    await expect(handler({ context: authContext } as any)).rejects.toThrow('Company not found')
  })

  it('rejects when user is not a member', async () => {
    mockGetCompanyMembershipRole.mockResolvedValue(null)

    const handler = await loadHandler()

    await expect(handler({ context: authContext } as any)).rejects.toThrow(
      'You are not a member of this company',
    )
  })

  it('returns invites when member', async () => {
    mockListCompanyInvites.mockResolvedValue([{ id: 'inv-1' }])

    const handler = await loadHandler()
    const result = await handler({ context: authContext } as any)

    expect(result).toEqual({ invites: [{ id: 'inv-1' }] })
    expect(mockListCompanyInvites).toHaveBeenCalledWith('company-1')
  })

  it('regression: owner keeps listing invites (any-member check)', async () => {
    mockGetCompanyMembershipRole.mockResolvedValue('owner')

    const handler = await loadHandler()
    const result = await handler({ context: authContext } as any)

    expect(result).toEqual({ invites: [] })
  })
})

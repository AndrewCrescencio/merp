import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindCompanyById = vi.fn()
const mockGetCompanyMembershipRole = vi.fn()
const mockListCompanyInvites = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getQuery: (event: any) => event.context.query,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/auth/company/repository', () => ({
  companyRepository: {
    findCompanyById: mockFindCompanyById,
    getCompanyMembershipRole: mockGetCompanyMembershipRole,
  },
}))

vi.mock('~~/server/utils/auth/invite/repository', () => ({
  inviteRepository: {
    listCompanyInvites: mockListCompanyInvites,
  },
}))

vi.mock('~~/server/utils/shared/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/shared/errors')>()
  return {
    ...actual,
    sendValidationError: (msg: string) => {
      throw new Error(msg)
    },
    sendNotFoundError: (msg: string) => {
      throw new Error(msg)
    },
  }
})

const eventWithUser = (query: Record<string, unknown>) =>
  ({ context: { user: { id: 'user-1' }, query } }) as any

describe('GET /api/auth/invites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires authentication', async () => {
    const handler = await import('~~/server/api/auth/invites.get').then((m) => m.default)
    await expect(handler({ context: {} } as any)).rejects.toThrow('Authentication required.')
  })

  it('validates companyId is required', async () => {
    const handler = await import('~~/server/api/auth/invites.get').then((m) => m.default)
    await expect(handler(eventWithUser({}))).rejects.toThrow('companyId is required')
  })

  it('rejects when company does not exist', async () => {
    mockFindCompanyById.mockResolvedValue(null)

    const handler = await import('~~/server/api/auth/invites.get').then((m) => m.default)
    await expect(handler(eventWithUser({ companyId: 'company-1' }))).rejects.toThrow(
      'Company not found',
    )
  })

  it('rejects when user is not a member', async () => {
    mockFindCompanyById.mockResolvedValue({ id: 'company-1' })
    mockGetCompanyMembershipRole.mockResolvedValue(null)

    const handler = await import('~~/server/api/auth/invites.get').then((m) => m.default)
    await expect(handler(eventWithUser({ companyId: 'company-1' }))).rejects.toThrow(
      'You are not a member of this company',
    )
  })

  it('returns invites when member', async () => {
    mockFindCompanyById.mockResolvedValue({ id: 'company-1' })
    mockGetCompanyMembershipRole.mockResolvedValue('member')
    mockListCompanyInvites.mockResolvedValue([
      { id: 'invite-1', companyId: 'company-1', email: 'user@example.com' },
    ])

    const handler = await import('~~/server/api/auth/invites.get').then((m) => m.default)
    const result = await handler(eventWithUser({ companyId: 'company-1' }))

    expect(mockListCompanyInvites).toHaveBeenCalledWith('company-1')
    expect(result).toEqual({
      invites: [{ id: 'invite-1', companyId: 'company-1', email: 'user@example.com' }],
    })
  })

  it('regression: owner keeps listing invites (any-member check)', async () => {
    mockFindCompanyById.mockResolvedValue({ id: 'company-1' })
    mockGetCompanyMembershipRole.mockResolvedValue('owner')
    mockListCompanyInvites.mockResolvedValue([])

    const handler = await import('~~/server/api/auth/invites.get').then((m) => m.default)
    const result = await handler(eventWithUser({ companyId: 'company-1' }))

    expect(mockListCompanyInvites).toHaveBeenCalledWith('company-1')
    expect(result).toEqual({ invites: [] })
  })
})

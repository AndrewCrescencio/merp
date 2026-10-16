import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRouterParam = vi.fn()
const mockGetCompanyMembershipRole = vi.fn()
const mockRemoveCompanyMember = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockSendNotFoundError = vi.fn()
const mockSendForbiddenError = vi.fn()
const mockGetClientIp = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getRouterParam: mockGetRouterParam,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))
vi.mock('~~/server/utils/shared/ip', () => ({
  getClientIp: mockGetClientIp,
}))

// Ainda usado para resolver o PAPEL ALVO ao remover outro membro (o papel do
// chamador vem do tenant).
vi.mock('~~/server/utils/auth/company/membership', () => ({
  membershipRepository: {
    getCompanyMembershipRole: mockGetCompanyMembershipRole,
    removeCompanyMember: mockRemoveCompanyMember,
  },
}))

vi.mock('~~/server/utils/shared/audit', () => ({
  createAuthEvent: mockCreateAuthEvent,
}))

vi.mock('~~/server/utils/shared/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/shared/errors')>()
  return {
    ...actual,
    sendNotFoundError: mockSendNotFoundError,
    sendForbiddenError: mockSendForbiddenError,
  }
})

// companyId vem do path (middleware tenant, R1/R5); o alvo (userId) também vem
// do path via getRouterParam — nenhum id no body.
const ev = (role = 'owner') =>
  ({
    context: {
      user: { id: 'user-1', email: 'user@example.com' },
      tenant: { companyId: 'company-1', role },
    },
    headers: new Headers(),
  }) as any

describe('DELETE /api/v1/companies/{companyId}/members/{userId}', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendNotFoundError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockSendForbiddenError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockGetClientIp.mockReturnValue('1.2.3.4')
  })

  const loadHandler = () =>
    import('~~/server/api/v1/companies/[companyId]/members/[userId]/index.delete').then(
      (m) => m.default,
    )

  it('throws 401 when user is not authenticated', async () => {
    const handler = await loadHandler()

    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
  })

  it('throws 404 when the userId path param is missing', async () => {
    mockGetRouterParam.mockReturnValue(undefined)

    const handler = await loadHandler()

    await expect(handler(ev())).rejects.toThrow('Company member not found')
    expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
  })

  describe('leave (own userId)', () => {
    it('throws 403 when the user is the owner (must transfer or delete company)', async () => {
      mockGetRouterParam.mockReturnValue('user-1')

      const handler = await loadHandler()

      await expect(handler(ev('owner'))).rejects.toThrow('Cannot remove a company owner')
      expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
    })

    it('lets a member leave and logs the event', async () => {
      mockGetRouterParam.mockReturnValue('user-1')
      mockRemoveCompanyMember.mockResolvedValue(undefined)

      const handler = await loadHandler()

      const result = await handler(ev('member'))

      expect(result).toEqual({ message: 'Left company successfully' })
      expect(mockRemoveCompanyMember).toHaveBeenCalledWith('company-1', 'user-1', 'user-1')
      expect(mockCreateAuthEvent).toHaveBeenCalledWith({
        userId: 'user-1',
        email: 'user@example.com',
        eventType: 'member_removed',
        ipAddress: '1.2.3.4',
        metadata: { companyId: 'company-1', removedUserId: 'user-1' },
      })
    })
  })

  describe('remove another member (distinct userId)', () => {
    it('throws 403 when the caller is not the owner', async () => {
      mockGetRouterParam.mockReturnValue('target-2')

      const handler = await loadHandler()

      await expect(handler(ev('member'))).rejects.toThrow('Only company owners can remove members')
      expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
    })

    it('throws 404 when the target member is not found', async () => {
      mockGetRouterParam.mockReturnValue('target-2')
      mockGetCompanyMembershipRole.mockResolvedValue(null)

      const handler = await loadHandler()

      await expect(handler(ev('owner'))).rejects.toThrow('Company member not found')
      expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
    })

    it('throws 403 when the target member is an owner', async () => {
      mockGetRouterParam.mockReturnValue('target-2')
      mockGetCompanyMembershipRole.mockResolvedValue('owner')

      const handler = await loadHandler()

      await expect(handler(ev('owner'))).rejects.toThrow('Cannot remove a company owner')
      expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
    })

    it('lets the owner remove a member and logs the event', async () => {
      mockGetRouterParam.mockReturnValue('target-2')
      mockGetCompanyMembershipRole.mockResolvedValue('member')
      mockRemoveCompanyMember.mockResolvedValue(undefined)

      const handler = await loadHandler()

      const result = await handler(ev('owner'))

      expect(result).toEqual({ message: 'Member removed successfully' })
      expect(mockRemoveCompanyMember).toHaveBeenCalledWith('company-1', 'user-1', 'target-2')
      expect(mockCreateAuthEvent).toHaveBeenCalledWith({
        userId: 'user-1',
        email: 'user@example.com',
        eventType: 'member_removed',
        ipAddress: '1.2.3.4',
        metadata: { companyId: 'company-1', removedUserId: 'target-2' },
      })
    })
  })
})

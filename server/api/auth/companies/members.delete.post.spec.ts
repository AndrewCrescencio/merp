import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindCompanyById = vi.fn()
const mockGetCompanyMembershipRole = vi.fn()
const mockRemoveCompanyMember = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockSendValidationError = vi.fn()
const mockSendNotFoundError = vi.fn()
const mockSendForbiddenError = vi.fn()
const mockReadBody = vi.fn()
const mockGetClientIp = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
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

vi.mock('~~/server/utils/auth/company/repository', () => ({
  companyRepository: {
    findCompanyById: mockFindCompanyById,
  },
}))

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
    sendValidationError: mockSendValidationError,
    sendNotFoundError: mockSendNotFoundError,
    sendForbiddenError: mockSendForbiddenError,
  }
})

describe('POST /api/auth/companies/members/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockSendNotFoundError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockSendForbiddenError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockGetClientIp.mockReturnValue('1.2.3.4')
  })

  it('throws 401 when user is not authenticated', async () => {
    const handler = await import('~~/server/api/auth/companies/members.delete.post').then(
      (m) => m.default,
    )

    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
  })

  it('validates companyId is required', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await import('~~/server/api/auth/companies/members.delete.post').then(
      (m) => m.default,
    )

    const event = { context: { user: { id: 'user-1', email: 'user@example.com' } } } as any

    await expect(handler(event)).rejects.toThrow('companyId is required')
    expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
  })

  it('validates userId is a non-empty string when provided', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1', userId: '' })

    const handler = await import('~~/server/api/auth/companies/members.delete.post').then(
      (m) => m.default,
    )

    const event = { context: { user: { id: 'user-1', email: 'user@example.com' } } } as any

    await expect(handler(event)).rejects.toThrow('userId must be a non-empty string')
    expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
  })

  it('throws 404 when company not found', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1' })
    mockFindCompanyById.mockResolvedValue(null)

    const handler = await import('~~/server/api/auth/companies/members.delete.post').then(
      (m) => m.default,
    )

    const event = { context: { user: { id: 'user-1', email: 'user@example.com' } } } as any

    await expect(handler(event)).rejects.toThrow('Company not found')
    expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
  })

  describe('leave (no userId)', () => {
    it('throws 403 when user is not a member of the company', async () => {
      mockReadBody.mockResolvedValue({ companyId: 'company-1' })
      mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Co' })
      mockGetCompanyMembershipRole.mockResolvedValue(null)

      const handler = await import('~~/server/api/auth/companies/members.delete.post').then(
        (m) => m.default,
      )

      const event = {
        context: { user: { id: 'user-1', email: 'user@example.com' } },
        headers: new Headers(),
      } as any

      await expect(handler(event)).rejects.toThrow('You are not a member of this company')
      expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
    })

    it('throws 403 when the user is the owner (must transfer or delete company)', async () => {
      mockReadBody.mockResolvedValue({ companyId: 'company-1' })
      mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Co' })
      mockGetCompanyMembershipRole.mockResolvedValue('owner')

      const handler = await import('~~/server/api/auth/companies/members.delete.post').then(
        (m) => m.default,
      )

      const event = {
        context: { user: { id: 'user-1', email: 'user@example.com' } },
        headers: new Headers(),
      } as any

      await expect(handler(event)).rejects.toThrow('Cannot remove a company owner')
      expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
    })

    it('lets a member leave and logs the event', async () => {
      mockReadBody.mockResolvedValue({ companyId: 'company-1' })
      mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Co' })
      mockGetCompanyMembershipRole.mockResolvedValue('member')
      mockRemoveCompanyMember.mockResolvedValue(undefined)

      const handler = await import('~~/server/api/auth/companies/members.delete.post').then(
        (m) => m.default,
      )

      const event = {
        context: { user: { id: 'user-1', email: 'user@example.com' } },
        headers: new Headers(),
      } as any

      const result = await handler(event)

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

  describe('remove another member (with userId)', () => {
    it('throws 403 when the caller is not the owner', async () => {
      mockReadBody.mockResolvedValue({ companyId: 'company-1', userId: 'target-2' })
      mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Co' })
      mockGetCompanyMembershipRole.mockResolvedValue('member')

      const handler = await import('~~/server/api/auth/companies/members.delete.post').then(
        (m) => m.default,
      )

      const event = {
        context: { user: { id: 'user-1', email: 'user@example.com' } },
        headers: new Headers(),
      } as any

      await expect(handler(event)).rejects.toThrow('Only company owners can remove members')
      expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
    })

    it('throws 404 when the target member is not found', async () => {
      mockReadBody.mockResolvedValue({ companyId: 'company-1', userId: 'target-2' })
      mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Co' })
      mockGetCompanyMembershipRole.mockResolvedValueOnce('owner').mockResolvedValueOnce(null)

      const handler = await import('~~/server/api/auth/companies/members.delete.post').then(
        (m) => m.default,
      )

      const event = {
        context: { user: { id: 'user-1', email: 'user@example.com' } },
        headers: new Headers(),
      } as any

      await expect(handler(event)).rejects.toThrow('Company member not found')
      expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
    })

    it('throws 403 when the target member is an owner', async () => {
      mockReadBody.mockResolvedValue({ companyId: 'company-1', userId: 'target-2' })
      mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Co' })
      mockGetCompanyMembershipRole.mockResolvedValueOnce('owner').mockResolvedValueOnce('owner')

      const handler = await import('~~/server/api/auth/companies/members.delete.post').then(
        (m) => m.default,
      )

      const event = {
        context: { user: { id: 'user-1', email: 'user@example.com' } },
        headers: new Headers(),
      } as any

      await expect(handler(event)).rejects.toThrow('Cannot remove a company owner')
      expect(mockRemoveCompanyMember).not.toHaveBeenCalled()
    })

    it('lets the owner remove a member and logs the event', async () => {
      mockReadBody.mockResolvedValue({ companyId: 'company-1', userId: 'target-2' })
      mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Co' })
      mockGetCompanyMembershipRole.mockResolvedValueOnce('owner').mockResolvedValueOnce('member')
      mockRemoveCompanyMember.mockResolvedValue(undefined)

      const handler = await import('~~/server/api/auth/companies/members.delete.post').then(
        (m) => m.default,
      )

      const event = {
        context: { user: { id: 'user-1', email: 'user@example.com' } },
        headers: new Headers(),
      } as any

      const result = await handler(event)

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

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindCompanyById = vi.fn()
const mockGetCompanyMembershipRole = vi.fn()
const mockSoftDeleteCompany = vi.fn()
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
    getCompanyMembershipRole: mockGetCompanyMembershipRole,
    softDeleteCompany: mockSoftDeleteCompany,
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

describe('POST /api/auth/companies/delete', () => {
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
  })

  it('throws 401 when user is not authenticated', async () => {
    const handler = await import('~~/server/api/auth/companies.delete.post').then((m) => m.default)

    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockSoftDeleteCompany).not.toHaveBeenCalled()
  })

  it('validates companyId is required', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await import('~~/server/api/auth/companies.delete.post').then((m) => m.default)

    const event = { context: { user: { id: 'user-1', email: 'user@example.com' } } } as any

    await expect(handler(event)).rejects.toThrow('companyId is required')
    expect(mockSoftDeleteCompany).not.toHaveBeenCalled()
  })

  it('throws 404 when company not found', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1' })
    mockFindCompanyById.mockResolvedValue(null)

    const handler = await import('~~/server/api/auth/companies.delete.post').then((m) => m.default)

    const event = { context: { user: { id: 'user-1', email: 'user@example.com' } } } as any

    await expect(handler(event)).rejects.toThrow('Company not found')
    expect(mockSoftDeleteCompany).not.toHaveBeenCalled()
  })

  it('throws 403 when user is not a member', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1' })
    mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Co' })
    mockGetCompanyMembershipRole.mockResolvedValue(null)

    const handler = await import('~~/server/api/auth/companies.delete.post').then((m) => m.default)

    const event = { context: { user: { id: 'user-1', email: 'user@example.com' } } } as any

    await expect(handler(event)).rejects.toThrow('You are not a member of this company')
    expect(mockSoftDeleteCompany).not.toHaveBeenCalled()
  })

  it('throws 403 when user is a member but not the owner', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1' })
    mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Co' })
    mockGetCompanyMembershipRole.mockResolvedValue('member')

    const handler = await import('~~/server/api/auth/companies.delete.post').then((m) => m.default)

    const event = { context: { user: { id: 'user-1', email: 'user@example.com' } } } as any

    await expect(handler(event)).rejects.toThrow('Only company owners can delete companies')
    expect(mockSoftDeleteCompany).not.toHaveBeenCalled()
  })

  it('soft deletes company and logs event on success', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1' })
    mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Co' })
    mockGetCompanyMembershipRole.mockResolvedValue('owner')
    mockSoftDeleteCompany.mockResolvedValue({
      id: 'company-1',
      name: 'Test Co',
      isDeleted: true,
    })

    const handler = await import('~~/server/api/auth/companies.delete.post').then((m) => m.default)

    const event = {
      context: { user: { id: 'user-1', email: 'user@example.com' } },
      headers: new Headers(),
    } as any

    const result = await handler(event)

    expect(result).toEqual({ message: 'Company deleted successfully' })
    expect(mockSoftDeleteCompany).toHaveBeenCalledWith('company-1', 'user-1')
    expect(mockCreateAuthEvent).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      eventType: 'company_deleted',
      ipAddress: null,
      metadata: { companyId: 'company-1' },
    })
  })
})

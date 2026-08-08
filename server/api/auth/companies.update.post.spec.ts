import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindCompanyById = vi.fn()
const mockGetCompanyMembershipRole = vi.fn()
const mockUpdateCompany = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockSendValidationError = vi.fn()
const mockSendNotFoundError = vi.fn()
const mockSendForbiddenError = vi.fn()
const mockReadBody = vi.fn()
const mockGetRequestIP = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
  getRequestIP: mockGetRequestIP,
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
    updateCompany: mockUpdateCompany,
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

describe('POST /api/auth/companies/update', () => {
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

  const loadHandler = () =>
    import('~~/server/api/auth/companies.update.post').then((m) => m.default)

  it('throws 401 when user is not authenticated', async () => {
    const handler = await loadHandler()

    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockUpdateCompany).not.toHaveBeenCalled()
  })

  it('validates companyId is required', async () => {
    mockReadBody.mockResolvedValue({ name: 'New Name' })

    const handler = await loadHandler()

    const event = { context: { user: { id: 'user-1', email: 'user@example.com' } } } as any

    await expect(handler(event)).rejects.toThrow('companyId is required')
    expect(mockUpdateCompany).not.toHaveBeenCalled()
  })

  it('validates at least one field is provided', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1' })

    const handler = await loadHandler()

    const event = { context: { user: { id: 'user-1', email: 'user@example.com' } } } as any

    await expect(handler(event)).rejects.toThrow(
      'At least one field (name, cnpj, razaoSocial) is required',
    )
    expect(mockUpdateCompany).not.toHaveBeenCalled()
  })

  it('throws 404 when company not found', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1', name: 'New Name' })
    mockFindCompanyById.mockResolvedValue(null)

    const handler = await loadHandler()

    const event = { context: { user: { id: 'user-1', email: 'user@example.com' } } } as any

    await expect(handler(event)).rejects.toThrow('Company not found')
    expect(mockUpdateCompany).not.toHaveBeenCalled()
  })

  it('throws 403 when user is not a member', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1', name: 'New Name' })
    mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Co' })
    mockGetCompanyMembershipRole.mockResolvedValue(null)

    const handler = await loadHandler()

    const event = { context: { user: { id: 'user-1', email: 'user@example.com' } } } as any

    await expect(handler(event)).rejects.toThrow('You are not a member of this company')
    expect(mockUpdateCompany).not.toHaveBeenCalled()
  })

  it('throws 403 when user is a member but not the owner', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1', name: 'New Name' })
    mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Co' })
    mockGetCompanyMembershipRole.mockResolvedValue('member')

    const handler = await loadHandler()

    const event = { context: { user: { id: 'user-1', email: 'user@example.com' } } } as any

    await expect(handler(event)).rejects.toThrow('Only company owners can update companies')
    expect(mockUpdateCompany).not.toHaveBeenCalled()
  })

  it('trims fields and updates the company on success', async () => {
    mockReadBody.mockResolvedValue({
      companyId: 'company-1',
      name: '  New Name  ',
      cnpj: ' 12345678000190 ',
      razaoSocial: ' New Razao ',
    })
    mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Co' })
    mockGetCompanyMembershipRole.mockResolvedValue('owner')
    mockUpdateCompany.mockResolvedValue({
      id: 'company-1',
      name: 'New Name',
      cnpj: '12345678000190',
      razaoSocial: 'New Razao',
    })

    const handler = await loadHandler()

    const event = {
      context: { user: { id: 'user-1', email: 'user@example.com' } },
      headers: new Headers(),
    } as any

    const result = await handler(event)

    expect(result).toMatchObject({
      id: 'company-1',
      name: 'New Name',
      cnpj: '12345678000190',
      razaoSocial: 'New Razao',
    })
    expect(mockUpdateCompany).toHaveBeenCalledWith('company-1', 'user-1', {
      name: 'New Name',
      cnpj: '12345678000190',
      razaoSocial: 'New Razao',
    })
    expect(mockCreateAuthEvent).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      eventType: 'company_updated',
      ipAddress: null,
      metadata: { companyId: 'company-1' },
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindCompanyById = vi.fn()
const mockIsCompanyMember = vi.fn()
const mockSetActiveCompany = vi.fn()
const mockReadBody = vi.fn()
const mockSendUnauthorizedError = vi.fn()
const mockSendValidationError = vi.fn()
const mockSendNotFoundError = vi.fn()
const mockSendForbiddenError = vi.fn()

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

vi.mock('~~/server/utils/auth/company/repository', () => ({
  companyRepository: {
    findCompanyById: mockFindCompanyById,
    isCompanyMember: mockIsCompanyMember,
    setActiveCompany: mockSetActiveCompany,
  },
}))

vi.mock('~~/server/utils/shared', () => ({
  sendUnauthorizedError: mockSendUnauthorizedError,
  sendValidationError: mockSendValidationError,
  sendNotFoundError: mockSendNotFoundError,
  sendForbiddenError: mockSendForbiddenError,
  validateCompanySwitchInput: (body: any) => {
    if (!body?.companyId || typeof body.companyId !== 'string') {
      throw new Error('Company ID is required')
    }
    return { companyId: body.companyId }
  },
}))

describe('POST /api/auth/companies/switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendUnauthorizedError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockSendNotFoundError.mockImplementation((msg: string) => {
      const err = new Error(msg)
      ;(err as any).status = 404
      throw err
    })
    mockSendForbiddenError.mockImplementation((msg: string) => {
      const err = new Error(msg)
      ;(err as any).status = 403
      throw err
    })
  })

  it('requires authentication', async () => {
    const handler = await import('~~/server/api/auth/companies.switch.post').then((m) => m.default)
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
  })

  it('validates companyId is required', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await import('~~/server/api/auth/companies.switch.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' }, session: { id: 'session-1' } } } as any

    await expect(handler(event)).rejects.toThrow('Company ID is required')
    expect(mockSetActiveCompany).not.toHaveBeenCalled()
  })

  it('returns 404 when company not found', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'nonexistent' })
    mockFindCompanyById.mockResolvedValue(null)

    const handler = await import('~~/server/api/auth/companies.switch.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' }, session: { id: 'session-1' } } } as any

    await expect(handler(event)).rejects.toThrow('Company not found or deleted')
  })

  it('returns 403 when user is not a member', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1' })
    mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Company' })
    mockIsCompanyMember.mockResolvedValue(false)

    const handler = await import('~~/server/api/auth/companies.switch.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' }, session: { id: 'session-1' } } } as any

    await expect(handler(event)).rejects.toThrow('User is not a member of the specified company')
  })

  it('switches active company successfully', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1' })
    mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Company' })
    mockIsCompanyMember.mockResolvedValue(true)
    mockSetActiveCompany.mockResolvedValue(undefined)

    const handler = await import('~~/server/api/auth/companies.switch.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' }, session: { id: 'session-1' } } } as any

    const result = await handler(event)

    expect(mockSetActiveCompany).toHaveBeenCalledWith('session-1', 'company-1', 'user-1')
    expect(result).toEqual({ message: 'Active company switched' })
    expect(event.context.activeCompanyId).toBe('company-1')
  })
})

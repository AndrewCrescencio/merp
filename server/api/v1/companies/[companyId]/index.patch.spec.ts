import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUpdateCompany = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockSendValidationError = vi.fn()
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

vi.mock('~~/server/utils/companies/company/repository', () => ({
  companyRepository: {
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
    sendForbiddenError: mockSendForbiddenError,
  }
})

const authContext = (role = 'owner') => ({
  user: { id: 'user-1', email: 'user@example.com', name: null },
  session: { id: 'session-1' },
  tenant: { companyId: 'company-1', role },
})

describe('PATCH /api/v1/companies/{companyId}', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockSendForbiddenError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockGetClientIp.mockReturnValue(undefined)
  })

  const loadHandler = () =>
    import('~~/server/api/v1/companies/[companyId]/index.patch').then((m) => m.default)

  it('throws 401 when user is not authenticated', async () => {
    const handler = await loadHandler()

    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockUpdateCompany).not.toHaveBeenCalled()
  })

  it('validates at least one field is provided', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await loadHandler()

    await expect(handler({ context: authContext() } as any)).rejects.toThrow(
      'At least one field (name) is required',
    )
    expect(mockUpdateCompany).not.toHaveBeenCalled()
  })

  it('rejects company name over 200 chars', async () => {
    mockReadBody.mockResolvedValue({ name: 'x'.repeat(201) })

    const handler = await loadHandler()

    await expect(handler({ context: authContext() } as any)).rejects.toThrow(
      'Company name must be at most 200 characters',
    )
    expect(mockUpdateCompany).not.toHaveBeenCalled()
  })

  it('throws 403 when user is a member but not the owner', async () => {
    mockReadBody.mockResolvedValue({ name: 'New Name' })

    const handler = await loadHandler()

    await expect(handler({ context: authContext('member') } as any)).rejects.toThrow(
      'Only company owners can update companies',
    )
    expect(mockUpdateCompany).not.toHaveBeenCalled()
  })

  it('trims fields and updates the company on success', async () => {
    mockReadBody.mockResolvedValue({ name: '  New Name  ' })
    mockUpdateCompany.mockResolvedValue({
      id: 'company-1',
      name: 'New Name',
    })

    const handler = await loadHandler()

    const result = await handler({ context: authContext() } as any)

    expect(result).toMatchObject({
      id: 'company-1',
      name: 'New Name',
    })
    expect(mockUpdateCompany).toHaveBeenCalledWith('company-1', 'user-1', {
      name: 'New Name',
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

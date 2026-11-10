import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSoftDeleteCompany = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockSendForbiddenError = vi.fn()
const mockGetClientIp = vi.fn()
const mockSendNoContent = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  sendNoContent: mockSendNoContent,
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
    sendForbiddenError: mockSendForbiddenError,
  }
})

// O middleware de tenant resolve { companyId, role } do path; DELETE não
// carrega companyId no body nem no handler.
const ev = (role = 'owner') =>
  ({
    context: {
      user: { id: 'user-1', email: 'user@example.com' },
      tenant: { companyId: 'company-1', role },
    },
    headers: new Headers(),
  }) as any

describe('DELETE /api/v1/companies/{companyId}', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendForbiddenError.mockImplementation((msg: string) => {
      throw new Error(msg)
    })
    mockGetClientIp.mockReturnValue(undefined)
  })

  const loadHandler = () =>
    import('~~/server/api/v1/companies/[companyId]/index.delete').then((m) => m.default)

  it('throws 401 when user is not authenticated', async () => {
    const handler = await loadHandler()

    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
    expect(mockSoftDeleteCompany).not.toHaveBeenCalled()
  })

  it('throws 403 when user is a member but not the owner', async () => {
    const handler = await loadHandler()

    await expect(handler(ev('member'))).rejects.toThrow('Only company owners can delete companies')
    expect(mockSoftDeleteCompany).not.toHaveBeenCalled()
  })

  it('soft deletes company and logs event on success', async () => {
    mockSoftDeleteCompany.mockResolvedValue({
      id: 'company-1',
      name: 'Test Co',
      isDeleted: true,
    })

    const handler = await loadHandler()

    const event = ev()
    const result = await handler(event)

    // DELETE responde 204 sem corpo (sendNoContent).
    expect(mockSendNoContent).toHaveBeenCalledWith(event)
    expect(result).toBeUndefined()
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

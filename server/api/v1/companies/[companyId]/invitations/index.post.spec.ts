import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateInvite = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockReadBody = vi.fn()
const mockGetClientIp = vi.fn()
const mockSetResponseStatus = vi.fn()
const mockSetHeader = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
  setResponseStatus: mockSetResponseStatus,
  setHeader: mockSetHeader,
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

vi.mock('~~/server/utils/auth/invite/repository', () => ({
  inviteRepository: {
    createInvite: mockCreateInvite,
  },
}))

vi.mock('~~/server/utils/shared/audit', () => ({
  createAuthEvent: mockCreateAuthEvent,
}))

vi.mock('~~/server/utils/shared/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/shared/errors')>()
  return {
    ...actual,
    sendValidationError: (msg: string) => {
      throw new Error(msg)
    },
  }
})

vi.mock('~~/server/utils/shared/security', async (importOriginal) => ({
  ...(await importOriginal()),
  checkIpRateLimit: vi.fn(),
}))

const authContext = (role = 'owner') => ({
  user: { id: 'user-1', email: 'owner@example.com', name: null },
  session: { id: 'session-1' },
  tenant: { companyId: 'company-1', role },
})

describe('POST /api/v1/companies/{companyId}/invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetClientIp.mockReturnValue('127.0.0.1')
  })

  const loadHandler = () =>
    import('~~/server/api/v1/companies/[companyId]/invitations/index.post').then((m) => m.default)

  it('requires authentication', async () => {
    const handler = await loadHandler()
    await expect(handler({ context: {} } as any)).rejects.toThrow('Authentication required.')
  })

  it('validates email format', async () => {
    mockReadBody.mockResolvedValue({ email: 'not-an-email' })

    const handler = await loadHandler()
    await expect(handler({ context: authContext() } as any)).rejects.toThrow(
      'A valid email is required',
    )
  })

  it('rejects oversized invite email', async () => {
    mockReadBody.mockResolvedValue({ email: `${'a'.repeat(300)}@example.com` })

    const handler = await loadHandler()
    await expect(handler({ context: authContext() } as any)).rejects.toThrow(
      'A valid email is required',
    )
    expect(mockCreateInvite).not.toHaveBeenCalled()
  })

  it('rejects when user is not an owner', async () => {
    mockReadBody.mockResolvedValue({ email: 'user@example.com' })

    const handler = await loadHandler()
    await expect(handler({ context: authContext('member') } as any)).rejects.toThrow(
      'Only company owners can invite members',
    )
    expect(mockCreateInvite).not.toHaveBeenCalled()
  })

  it('creates invite and logs event when owner', async () => {
    mockReadBody.mockResolvedValue({ email: 'User@Example.com' })
    mockCreateInvite.mockResolvedValue({
      id: 'invite-1',
      companyId: 'company-1',
      email: 'user@example.com',
      expiresAt: new Date('2026-08-08T00:00:00Z'),
      token: 'tok-1',
    })

    const handler = await loadHandler()
    const event = { context: authContext() } as any
    const result = await handler(event)

    expect(mockCreateInvite).toHaveBeenCalledWith({
      companyId: 'company-1',
      email: 'user@example.com',
      invitedBy: 'user-1',
    })
    expect(mockCreateAuthEvent).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'owner@example.com',
      eventType: 'invite_created',
      ipAddress: '127.0.0.1',
      metadata: { companyId: 'company-1', invitedEmail: 'user@example.com' },
    })
    expect(result).toEqual({
      id: 'invite-1',
      companyId: 'company-1',
      email: 'user@example.com',
      expiresAt: expect.any(Date),
      token: 'tok-1',
    })
    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 201)
    // criação aponta o recurso criado no header Location.
    expect(mockSetHeader).toHaveBeenCalledWith(
      event,
      'Location',
      '/api/v1/companies/company-1/invitations/invite-1',
    )
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindCompanyById = vi.fn()
const mockGetCompanyMembershipRole = vi.fn()
const mockCreateInvite = vi.fn()
const mockCreateAuthEvent = vi.fn()
const mockReadBody = vi.fn()
const mockGetClientIp = vi.fn()
const mockSetResponseStatus = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
  setResponseStatus: mockSetResponseStatus,
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
  },
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
    sendNotFoundError: (msg: string) => {
      throw new Error(msg)
    },
  }
})

vi.mock('~~/server/utils/shared/security', async (importOriginal) => ({
  ...(await importOriginal()),
  checkIpRateLimit: vi.fn(),
}))

const eventWithUser = (overrides: Record<string, unknown> = {}) =>
  ({ context: { user: { id: 'user-1', email: 'owner@example.com' } }, ...overrides }) as any

describe('POST /api/auth/invite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetClientIp.mockReturnValue('127.0.0.1')
  })

  it('requires authentication', async () => {
    const handler = await import('~~/server/api/auth/invite.post').then((m) => m.default)
    await expect(handler({ context: {} } as any)).rejects.toThrow('Authentication required.')
  })

  it('validates companyId is required', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await import('~~/server/api/auth/invite.post').then((m) => m.default)
    await expect(handler(eventWithUser())).rejects.toThrow('companyId is required')
  })

  it('validates email format', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1', email: 'not-an-email' })

    const handler = await import('~~/server/api/auth/invite.post').then((m) => m.default)
    await expect(handler(eventWithUser())).rejects.toThrow('A valid email is required')
  })

  it('AUD-14: rejects oversized invite email', async () => {
    mockReadBody.mockResolvedValue({
      companyId: 'company-1',
      email: `${'a'.repeat(300)}@example.com`,
    })

    const handler = await import('~~/server/api/auth/invite.post').then((m) => m.default)
    await expect(handler(eventWithUser())).rejects.toThrow('A valid email is required')
    expect(mockCreateInvite).not.toHaveBeenCalled()
  })

  it('rejects when company does not exist', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1', email: 'user@example.com' })
    mockFindCompanyById.mockResolvedValue(null)

    const handler = await import('~~/server/api/auth/invite.post').then((m) => m.default)
    await expect(handler(eventWithUser())).rejects.toThrow('Company not found')
  })

  it('rejects when user is not a member', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1', email: 'user@example.com' })
    mockFindCompanyById.mockResolvedValue({ id: 'company-1' })
    mockGetCompanyMembershipRole.mockResolvedValue(null)

    const handler = await import('~~/server/api/auth/invite.post').then((m) => m.default)
    await expect(handler(eventWithUser())).rejects.toThrow('You are not a member of this company')
  })

  it('rejects when user is not an owner', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1', email: 'user@example.com' })
    mockFindCompanyById.mockResolvedValue({ id: 'company-1' })
    mockGetCompanyMembershipRole.mockResolvedValue('member')

    const handler = await import('~~/server/api/auth/invite.post').then((m) => m.default)
    await expect(handler(eventWithUser())).rejects.toThrow('Only company owners can invite members')
  })

  it('creates invite and logs event when owner', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1', email: 'User@Example.com' })
    mockFindCompanyById.mockResolvedValue({ id: 'company-1' })
    mockGetCompanyMembershipRole.mockResolvedValue('owner')
    mockCreateInvite.mockResolvedValue({
      id: 'invite-1',
      companyId: 'company-1',
      email: 'user@example.com',
      expiresAt: new Date('2026-08-08T00:00:00Z'),
      token: 'tok-1',
    })

    const handler = await import('~~/server/api/auth/invite.post').then((m) => m.default)
    const event = eventWithUser()
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
  })
})

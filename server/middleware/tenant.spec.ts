import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRequestURL = vi.fn()
const mockGetCompanyMembershipRole = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getRequestURL: (...args: any[]) => mockGetRequestURL(...args),
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.statusCode ?? opts.status
    ;(err as any).statusCode = opts.statusCode ?? opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/auth/company/membership', () => ({
  membershipRepository: { getCompanyMembershipRole: mockGetCompanyMembershipRole },
}))

const USER = { id: 'user-1' }

function eventFor(path: string, user: unknown = USER) {
  mockGetRequestURL.mockReturnValue(new URL(`http://localhost:3000${path}`))
  return { context: { user } } as any
}

describe('tenant middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCompanyMembershipRole.mockResolvedValue('member')
  })

  it('ignores non-tenant paths (no tenant resolved)', async () => {
    const handler = await import('~~/server/middleware/tenant').then((m) => m.default)
    const event = eventFor('/api/v1/me')

    await handler(event)

    expect(event.context.tenant).toBeUndefined()
    expect(mockGetCompanyMembershipRole).not.toHaveBeenCalled()
  })

  it('resolves companyId from the path and sets tenant context for a member', async () => {
    const handler = await import('~~/server/middleware/tenant').then((m) => m.default)
    const event = eventFor('/api/v1/companies/comp-123/orders')

    await handler(event)

    expect(mockGetCompanyMembershipRole).toHaveBeenCalledWith('user-1', 'comp-123')
    expect(event.context.tenant).toEqual({ companyId: 'comp-123', role: 'member' })
  })

  it('resolves companyId when the path is the collection root (no trailing segment)', async () => {
    const handler = await import('~~/server/middleware/tenant').then((m) => m.default)
    const event = eventFor('/api/v1/companies/comp-123')

    await handler(event)

    expect(event.context.tenant).toEqual({ companyId: 'comp-123', role: 'member' })
  })

  it('throws 404 for a non-member (does not leak existence)', async () => {
    mockGetCompanyMembershipRole.mockResolvedValue(null)
    const handler = await import('~~/server/middleware/tenant').then((m) => m.default)
    const event = eventFor('/api/v1/companies/comp-404/orders')

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(event.context.tenant).toBeUndefined()
  })

  it('throws 401 when there is no session user (defensive)', async () => {
    const handler = await import('~~/server/middleware/tenant').then((m) => m.default)
    const event = eventFor('/api/v1/companies/comp-1/orders', null)

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 })
    expect(mockGetCompanyMembershipRole).not.toHaveBeenCalled()
  })
})

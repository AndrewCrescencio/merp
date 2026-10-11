import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindUserCompanies = vi.fn()
const mockGetActiveCompany = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/auth/company/membership', () => ({
  membershipRepository: {
    findUserCompanies: mockFindUserCompanies,
    getActiveCompany: mockGetActiveCompany,
  },
}))

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUserCompanies.mockResolvedValue([])
    mockGetActiveCompany.mockResolvedValue(null)
  })

  it('returns user info when authenticated', async () => {
    const handler = await import('~~/server/api/auth/me.get').then((m) => m.default)

    const event = {
      context: {
        user: {
          id: 'uuid-123',
          email: 'user@example.com',
          name: 'Test User',
        },
        session: { id: 'session-1' },
      },
    } as any

    const result = await handler(event)

    expect(result).toEqual({
      id: 'uuid-123',
      email: 'user@example.com',
      name: 'Test User',
      activeCompanyId: null,
      companies: [],
    })
  })

  it('returns null name when user has no name', async () => {
    const handler = await import('~~/server/api/auth/me.get').then((m) => m.default)

    const event = {
      context: {
        user: {
          id: 'uuid-123',
          email: 'user@example.com',
          name: null,
        },
        session: { id: 'session-1' },
      },
    } as any

    const result = await handler(event)

    expect(result).toEqual({
      id: 'uuid-123',
      email: 'user@example.com',
      name: null,
      activeCompanyId: null,
      companies: [],
    })
  })

  it('throws 401 when user is not authenticated', async () => {
    const handler = await import('~~/server/api/auth/me.get').then((m) => m.default)

    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
  })

  it('throws 401 when user is undefined', async () => {
    const handler = await import('~~/server/api/auth/me.get').then((m) => m.default)

    const event = { context: { user: undefined } } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
  })

  it('returns user companies and activeCompanyId', async () => {
    mockFindUserCompanies.mockResolvedValue([
      {
        id: 'c1',
        name: 'Company 1',
        role: 'owner',
        cnpj: null,
        razaoSocial: null,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'c2',
        name: 'Company 2',
        role: 'member',
        cnpj: null,
        razaoSocial: null,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    mockGetActiveCompany.mockResolvedValue('c1')

    const handler = await import('~~/server/api/auth/me.get').then((m) => m.default)

    const event = {
      context: {
        user: { id: 'uuid-123', email: 'user@example.com', name: 'Test User' },
        session: { id: 'session-1' },
      },
    } as any

    const result = await handler(event)

    expect(result.activeCompanyId).toBe('c1')
    expect(result.companies).toEqual([
      { id: 'c1', name: 'Company 1', role: 'owner' },
      { id: 'c2', name: 'Company 2', role: 'member' },
    ])
  })

  it('returns empty companies when user has no memberships', async () => {
    const handler = await import('~~/server/api/auth/me.get').then((m) => m.default)

    const event = {
      context: {
        user: { id: 'uuid-123', email: 'user@example.com', name: 'Test User' },
        session: { id: 'session-1' },
      },
    } as any

    const result = await handler(event)

    expect(result.activeCompanyId).toBeNull()
    expect(result.companies).toEqual([])
  })

  it('returns null activeCompanyId when no session', async () => {
    mockFindUserCompanies.mockResolvedValue([])

    const handler = await import('~~/server/api/auth/me.get').then((m) => m.default)

    const event = {
      context: {
        user: { id: 'uuid-123', email: 'user@example.com', name: 'Test User' },
      },
    } as any

    const result = await handler(event)

    expect(result.activeCompanyId).toBeNull()
    expect(mockGetActiveCompany).not.toHaveBeenCalled()
  })
})

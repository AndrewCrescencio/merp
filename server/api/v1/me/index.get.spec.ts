import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindUserCompanies = vi.fn()

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
  },
}))

describe('GET /api/v1/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUserCompanies.mockResolvedValue([])
  })

  it('returns user info when authenticated', async () => {
    const handler = await import('~~/server/api/v1/me/index.get').then((m) => m.default)

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
      companies: [],
    })
  })

  it('returns null name when user has no name', async () => {
    const handler = await import('~~/server/api/v1/me/index.get').then((m) => m.default)

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
      companies: [],
    })
  })

  it('throws 401 when user is not authenticated', async () => {
    const handler = await import('~~/server/api/v1/me/index.get').then((m) => m.default)

    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
  })

  it('throws 401 when user is undefined', async () => {
    const handler = await import('~~/server/api/v1/me/index.get').then((m) => m.default)

    const event = { context: { user: undefined } } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
  })

  it('returns user companies', async () => {
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

    const handler = await import('~~/server/api/v1/me/index.get').then((m) => m.default)

    const event = {
      context: {
        user: { id: 'uuid-123', email: 'user@example.com', name: 'Test User' },
        session: { id: 'session-1' },
      },
    } as any

    const result = await handler(event)

    expect(result.companies).toEqual([
      { id: 'c1', name: 'Company 1', role: 'owner' },
      { id: 'c2', name: 'Company 2', role: 'member' },
    ])
  })

  it('returns empty companies when user has no memberships', async () => {
    const handler = await import('~~/server/api/v1/me/index.get').then((m) => m.default)

    const event = {
      context: {
        user: { id: 'uuid-123', email: 'user@example.com', name: 'Test User' },
        session: { id: 'session-1' },
      },
    } as any

    const result = await handler(event)

    expect(result.companies).toEqual([])
  })
})

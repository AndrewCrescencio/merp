import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindById = vi.fn()
const mockFindUserCompanies = vi.fn()
const mockGetUserSessions = vi.fn()
const mockListUserAuthEvents = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/auth/identity/repository', () => ({
  identityRepository: {
    findById: mockFindById,
    getUserSessions: mockGetUserSessions,
    listUserAuthEvents: mockListUserAuthEvents,
  },
}))

vi.mock('~~/server/utils/auth/company/repository', () => ({
  companyRepository: {
    findUserCompanies: mockFindUserCompanies,
  },
}))

describe('GET /api/auth/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUserCompanies.mockResolvedValue([])
    mockGetUserSessions.mockResolvedValue([])
    mockListUserAuthEvents.mockResolvedValue([])
  })

  it('throws 401 when user is not authenticated', async () => {
    const handler = await import('~~/server/api/auth/export.get').then((m) => m.default)

    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
  })

  it('returns user data export with profile, companies, sessions and auth events', async () => {
    const createdAt = new Date('2026-01-01')
    mockFindById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    })
    mockFindUserCompanies.mockResolvedValue([
      {
        id: 'c1',
        name: 'Company 1',
        cnpj: '12.345.678/0001-90',
        razaoSocial: 'Company 1 LTDA',
        role: 'owner',
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    mockGetUserSessions.mockResolvedValue([
      { id: 's1', createdAt: new Date(), expiresAt: new Date() },
    ])
    mockListUserAuthEvents.mockResolvedValue([
      { id: 'e1', eventType: 'login', ipAddress: '127.0.0.1', createdAt: new Date() },
    ])

    const handler = await import('~~/server/api/auth/export.get').then((m) => m.default)

    const event = {
      context: {
        user: { id: 'user-1', email: 'user@example.com', name: 'Test User' },
      },
    } as any

    const result = await handler(event)

    expect(result).toHaveProperty('profile')
    expect(result).toHaveProperty('companies')
    expect(result).toHaveProperty('sessions')
    expect(result).toHaveProperty('authEvents')
    expect(result.profile).toMatchObject({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
    })
    expect(result.companies).toHaveLength(1)
    expect(result.companies[0]).toMatchObject({
      id: 'c1',
      name: 'Company 1',
      role: 'owner',
    })
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0]).toHaveProperty('id', 's1')
    expect(mockListUserAuthEvents).toHaveBeenCalledWith('user-1')
    expect(result.authEvents).toHaveLength(1)
    expect(result.authEvents[0]).toMatchObject({ id: 'e1', eventType: 'login' })
  })

  it('returns empty companies and sessions arrays when none exist', async () => {
    const createdAt = new Date('2026-01-01')
    mockFindById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    })

    const handler = await import('~~/server/api/auth/export.get').then((m) => m.default)

    const event = {
      context: {
        user: { id: 'user-1', email: 'user@example.com', name: 'Test User' },
      },
    } as any

    const result = await handler(event)

    expect(result.companies).toEqual([])
    expect(result.sessions).toEqual([])
    expect(result.authEvents).toEqual([])
  })
})

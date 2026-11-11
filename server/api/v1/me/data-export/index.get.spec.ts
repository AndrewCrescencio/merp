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

describe('GET /api/v1/me/data-export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUserCompanies.mockResolvedValue([])
  })

  it('exports user data', async () => {
    const handler = await import('~~/server/api/v1/me/data-export/index.get').then((m) => m.default)

    const event = {
      context: {
        user: { id: 'user-1', email: 'a@b.c', name: 'User A' },
        session: { id: 'session-1' },
      },
      headers: new Headers(),
    } as any

    const result = await handler(event)

    expect(result.profile).toEqual({
      id: 'user-1',
      email: 'a@b.c',
      name: 'User A',
      createdAt: undefined,
    })
    expect(result.companies).toEqual([])
    expect(result.sessions).toEqual([])
    expect(result.authEvents).toEqual([])
    expect(mockFindUserCompanies).toHaveBeenCalledWith('user-1')
  })
})

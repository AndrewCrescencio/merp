import { describe, it, vi, beforeEach } from 'vitest'

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
  })

  it('exports user data', async () => {
    // Test setup
  })
})

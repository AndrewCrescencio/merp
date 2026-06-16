import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindCompanyById = vi.fn()
const mockCreateCompanyMember = vi.fn()
const mockReadBody = vi.fn()

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

vi.mock('~~/server/utils/auth/repository', () => ({
  authRepository: {
    findCompanyById: mockFindCompanyById,
    createCompanyMember: mockCreateCompanyMember,
  },
}))

vi.mock('~~/server/utils/auth/helpers', () => ({
  sendValidationError: (msg: string) => {
    throw new Error(msg)
  },
  sendNotFoundError: (msg: string) => {
    const err = new Error(msg)
    ;(err as any).status = 404
    throw err
  },
}))

describe('POST /api/auth/companies/join', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires authentication', async () => {
    const handler = await import('~~/server/api/auth/companies.join.post').then((m) => m.default)
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
  })

  it('validates companyId is required', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await import('~~/server/api/auth/companies.join.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    await expect(handler(event)).rejects.toThrow('Company ID is required')
    expect(mockCreateCompanyMember).not.toHaveBeenCalled()
  })

  it('returns 404 when company not found', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'nonexistent' })
    mockFindCompanyById.mockResolvedValue(null)

    const handler = await import('~~/server/api/auth/companies.join.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    await expect(handler(event)).rejects.toThrow('Company not found or deleted')
  })

  it('joins company successfully', async () => {
    mockReadBody.mockResolvedValue({ companyId: 'company-1' })
    mockFindCompanyById.mockResolvedValue({ id: 'company-1', name: 'Test Company' })
    mockCreateCompanyMember.mockResolvedValue({ id: 'member-1' })

    const handler = await import('~~/server/api/auth/companies.join.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    const result = await handler(event)

    expect(mockCreateCompanyMember).toHaveBeenCalledWith('company-1', 'user-1', 'member')
    expect(result).toEqual({ message: 'Joined company successfully' })
  })
})

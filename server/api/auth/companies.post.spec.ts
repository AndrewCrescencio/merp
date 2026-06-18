import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateCompany = vi.fn()
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
    createCompany: mockCreateCompany,
    createCompanyMember: mockCreateCompanyMember,
  },
}))

vi.mock('~~/server/utils/auth/helpers', () => ({
  sendValidationError: (msg: string) => {
    throw new Error(msg)
  },
}))

describe('POST /api/auth/companies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires authentication', async () => {
    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
  })

  it('validates company name is required', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    await expect(handler(event)).rejects.toThrow('Company name is required')
    expect(mockCreateCompany).not.toHaveBeenCalled()
  })

  it('creates company and makes user first member as owner', async () => {
    mockReadBody.mockResolvedValue({ name: 'Test Company', cnpj: '12345678901234' })
    mockCreateCompany.mockResolvedValue({ id: 'company-1', name: 'Test Company' })
    mockCreateCompanyMember.mockResolvedValue({ id: 'member-1' })

    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    const result = await handler(event)

    expect(mockCreateCompany).toHaveBeenCalledWith({
      name: 'Test Company',
      cnpj: '12345678901234',
      razaoSocial: undefined,
    })
    expect(mockCreateCompanyMember).toHaveBeenCalledWith('company-1', 'user-1', 'owner')
    expect(result).toEqual({ id: 'company-1', name: 'Test Company' })
  })

  it('trims company name', async () => {
    mockReadBody.mockResolvedValue({ name: '  My Company  ' })
    mockCreateCompany.mockResolvedValue({ id: 'company-1', name: 'My Company' })
    mockCreateCompanyMember.mockResolvedValue({ id: 'member-1' })

    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    await handler(event)

    expect(mockCreateCompany).toHaveBeenCalledWith({
      name: 'My Company',
      cnpj: undefined,
      razaoSocial: undefined,
    })
  })
})

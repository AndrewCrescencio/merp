import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateCompanyWithOwner = vi.fn()
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

vi.mock('~~/server/utils/auth/company/repository', () => ({
  companyRepository: {
    createCompanyWithOwner: mockCreateCompanyWithOwner,
  },
}))

vi.mock('~~/server/utils/shared/errors', () => ({
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
    expect(mockCreateCompanyWithOwner).not.toHaveBeenCalled()
  })

  it('creates company and makes user first member as owner', async () => {
    mockReadBody.mockResolvedValue({ name: 'Test Company', cnpj: '12345678901234' })
    mockCreateCompanyWithOwner.mockResolvedValue({ id: 'company-1', name: 'Test Company' })

    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    const result = await handler(event)

    expect(mockCreateCompanyWithOwner).toHaveBeenCalledWith(
      {
        name: 'Test Company',
        cnpj: '12345678901234',
        razaoSocial: undefined,
      },
      'user-1',
    )
    expect(result).toEqual({ id: 'company-1', name: 'Test Company' })
  })

  it('trims company name', async () => {
    mockReadBody.mockResolvedValue({ name: '  My Company  ' })
    mockCreateCompanyWithOwner.mockResolvedValue({ id: 'company-1', name: 'My Company' })

    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    await handler(event)

    expect(mockCreateCompanyWithOwner).toHaveBeenCalledWith(
      {
        name: 'My Company',
        cnpj: undefined,
        razaoSocial: undefined,
      },
      'user-1',
    )
  })
})

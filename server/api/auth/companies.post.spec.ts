import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateCompanyWithOwner = vi.fn()
const mockReadBody = vi.fn()
const mockCheckIpRateLimit = vi.fn()
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

vi.mock('~~/server/utils/shared/security', async (importOriginal) => ({
  ...(await importOriginal()),
  checkIpRateLimit: mockCheckIpRateLimit,
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
    mockCheckIpRateLimit.mockResolvedValue(undefined)
  })

  it('requires authentication', async () => {
    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: {} } as any

    await expect(handler(event)).rejects.toThrow('Authentication required.')
  })

  it('AUD-14: checks IP rate limit before reading the body', async () => {
    mockReadBody.mockResolvedValue({ name: 'Test Company' })
    mockCreateCompanyWithOwner.mockResolvedValue({ id: 'company-1', name: 'Test Company' })

    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    await handler(event)

    expect(mockCheckIpRateLimit).toHaveBeenCalledWith(event)
  })

  it('returns 429 from IP rate limit without reading the body', async () => {
    const ipError: any = new Error('rate limited')
    ipError.status = 429
    ipError.statusCode = 429
    mockCheckIpRateLimit.mockRejectedValue(ipError)

    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    await expect(handler(event)).rejects.toMatchObject({ statusCode: 429 })
    expect(mockReadBody).not.toHaveBeenCalled()
    expect(mockCreateCompanyWithOwner).not.toHaveBeenCalled()
  })

  it('validates company name is required', async () => {
    mockReadBody.mockResolvedValue({})

    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    await expect(handler(event)).rejects.toThrow('Company name is required')
    expect(mockCreateCompanyWithOwner).not.toHaveBeenCalled()
  })

  it('AUD-21: rejects company name over 200 chars', async () => {
    mockReadBody.mockResolvedValue({ name: 'x'.repeat(201) })

    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    await expect(handler(event)).rejects.toThrow('Company name must be at most 200 characters')
    expect(mockCreateCompanyWithOwner).not.toHaveBeenCalled()
  })

  it('AUD-21/23: rejects non-string cnpj instead of throwing TypeError', async () => {
    mockReadBody.mockResolvedValue({ name: 'Test Company', cnpj: 12345678901234 })

    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    await expect(handler(event)).rejects.toThrow('cnpj must be a string')
    expect(mockCreateCompanyWithOwner).not.toHaveBeenCalled()
  })

  it('AUD-21: rejects cnpj over 30 chars', async () => {
    mockReadBody.mockResolvedValue({ name: 'Test Company', cnpj: '1'.repeat(31) })

    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    await expect(handler(event)).rejects.toThrow('cnpj must be at most 30 characters')
    expect(mockCreateCompanyWithOwner).not.toHaveBeenCalled()
  })

  it('rejects cnpj with invalid check digits', async () => {
    mockReadBody.mockResolvedValue({ name: 'Test Company', cnpj: '12345678000190' })

    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    await expect(handler(event)).rejects.toThrow('cnpj is invalid')
    expect(mockCreateCompanyWithOwner).not.toHaveBeenCalled()
  })

  it('creates company and makes user first member as owner', async () => {
    mockReadBody.mockResolvedValue({ name: 'Test Company', cnpj: '11222333000181' })
    mockCreateCompanyWithOwner.mockResolvedValue({ id: 'company-1', name: 'Test Company' })

    const handler = await import('~~/server/api/auth/companies.post').then((m) => m.default)
    const event = { context: { user: { id: 'user-1' } } } as any

    const result = await handler(event)

    expect(mockCreateCompanyWithOwner).toHaveBeenCalledWith(
      {
        name: 'Test Company',
        cnpj: '11222333000181',
        razaoSocial: undefined,
      },
      'user-1',
    )
    expect(result).toEqual({ id: 'company-1', name: 'Test Company' })
    expect(mockSetResponseStatus).toHaveBeenCalledWith(event, 201)
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

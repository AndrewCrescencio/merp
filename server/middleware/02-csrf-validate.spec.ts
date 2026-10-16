import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRequestURL = vi.fn()
const mockGetMethod = vi.fn()
const mockValidateCsrf = vi.fn()
const mockIsCsrfExempt = vi.fn((path: string) => path === '/api/auth/login')
const mockSendAuthError = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getRequestURL: (...args: any[]) => mockGetRequestURL(...args),
  getMethod: (...args: any[]) => mockGetMethod(...args),
}))

vi.mock('~~/server/utils/shared/csrf', () => ({
  validateCsrf: (...args: any[]) => mockValidateCsrf(...args),
  isCsrfExempt: (path: string) => mockIsCsrfExempt(path),
}))

vi.mock('~~/server/utils/shared/errors', () => ({
  sendAuthError: (...args: any[]) => mockSendAuthError(...args),
}))

describe('02-csrf-validate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRequestURL.mockReturnValue({ pathname: '/api/test' })
    mockGetMethod.mockReturnValue('GET')
    mockValidateCsrf.mockReturnValue(true)
    mockSendAuthError.mockReturnValue(undefined)
  })

  it('não executa para rotas não-API', async () => {
    mockGetRequestURL.mockReturnValue({ pathname: '/some/page' })
    mockGetMethod.mockReturnValue('GET')

    const handler = await import('./02-csrf-validate').then((m) => m.default)
    await handler({} as any)

    expect(mockValidateCsrf).not.toHaveBeenCalled()
  })

  it('não executa para métodos seguros (GET)', async () => {
    mockGetRequestURL.mockReturnValue({ pathname: '/api/v1/me' })
    mockGetMethod.mockReturnValue('GET')

    const handler = await import('./02-csrf-validate').then((m) => m.default)
    await handler({} as any)

    expect(mockValidateCsrf).not.toHaveBeenCalled()
  })

  it('não executa para rotas isentas', async () => {
    mockGetRequestURL.mockReturnValue({ pathname: '/api/auth/login' })
    mockGetMethod.mockReturnValue('POST')

    const handler = await import('./02-csrf-validate').then((m) => m.default)
    await handler({} as any)

    expect(mockValidateCsrf).not.toHaveBeenCalled()
  })

  it('retorna 403 quando POST sem header x-csrf-token em rota não-isenta', async () => {
    mockGetRequestURL.mockReturnValue({ pathname: '/api/v1/companies' })
    mockGetMethod.mockReturnValue('POST')
    mockValidateCsrf.mockReturnValue(false)

    const handler = await import('./02-csrf-validate').then((m) => m.default)
    await handler({} as any)

    expect(mockSendAuthError).toHaveBeenCalledWith(
      403,
      'csrf_invalid',
      'Invalid CSRF token. Please refresh the page and try again.',
    )
  })

  it('não retorna erro quando CSRF válido', async () => {
    mockGetRequestURL.mockReturnValue({ pathname: '/api/v1/companies' })
    mockGetMethod.mockReturnValue('POST')
    mockValidateCsrf.mockReturnValue(true)

    const handler = await import('./02-csrf-validate').then((m) => m.default)
    await handler({} as any)

    expect(mockSendAuthError).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRequestURL = vi.fn()
const mockGetMethod = vi.fn()
const mockGetOrCreateCsrfToken = vi.fn()
const mockIsCsrfExempt = vi.fn((path: string) => path === '/api/auth/login')

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  getRequestURL: (...args: any[]) => mockGetRequestURL(...args),
  getMethod: (...args: any[]) => mockGetMethod(...args),
}))

vi.mock('~~/server/utils/shared/csrf', () => ({
  getOrCreateCsrfToken: (...args: any[]) => mockGetOrCreateCsrfToken(...args),
  isCsrfExempt: (...args: any[]) => mockIsCsrfExempt(...args),
}))

describe('01-csrf-token middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRequestURL.mockReturnValue({ pathname: '/api/test' })
    mockGetMethod.mockReturnValue('GET')
  })

  it('não executa para rotas não-API', async () => {
    mockGetRequestURL.mockReturnValue({ pathname: '/some/page' })
    mockGetMethod.mockReturnValue('GET')

    const handler = await import('./01-csrf-token').then((m) => m.default)
    await handler({} as any)

    expect(mockGetOrCreateCsrfToken).not.toHaveBeenCalled()
  })

  it('executa getOrCreateCsrfToken para métodos seguros (GET) em rota API', async () => {
    mockGetRequestURL.mockReturnValue({ pathname: '/api/auth/me' })
    mockGetMethod.mockReturnValue('GET')

    const handler = await import('./01-csrf-token').then((m) => m.default)
    await handler({} as any)

    expect(mockGetOrCreateCsrfToken).toHaveBeenCalled()
  })

  it('não executa para rotas isentas', async () => {
    mockGetRequestURL.mockReturnValue({ pathname: '/api/auth/login' })
    mockGetMethod.mockReturnValue('POST')

    const handler = await import('./01-csrf-token').then((m) => m.default)
    await handler({} as any)

    expect(mockGetOrCreateCsrfToken).not.toHaveBeenCalled()
  })

  it('não executa para métodos não-seguros (POST) - validação feita no 02-csrf-validate', async () => {
    mockGetRequestURL.mockReturnValue({ pathname: '/api/auth/companies' })
    mockGetMethod.mockReturnValue('POST')

    const handler = await import('./01-csrf-token').then((m) => m.default)
    await handler({} as any)

    expect(mockGetOrCreateCsrfToken).not.toHaveBeenCalled()
  })
})

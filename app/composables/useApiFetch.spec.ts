import { afterEach, describe, expect, it, vi } from 'vitest'
import { CSRF_COOKIE_NAME } from '#shared/app'
import { useApiFetch } from './useApiFetch'

const { captureTokenReader } = vi.hoisted(() => ({ captureTokenReader: vi.fn() }))

vi.mock('~~/shared/api-transport', () => ({
  createApiTransport: vi.fn((_fetcher, getCsrfToken) => {
    captureTokenReader.mockImplementation(getCsrfToken)
    return vi.fn()
  }),
  isInternalApiPath: vi.fn(),
}))

describe('useApiFetch CSRF token', () => {
  afterEach(() => {
    document.cookie = `${CSRF_COOKIE_NAME}=; Max-Age=0; Path=/`
    vi.unstubAllGlobals()
  })

  it('lê o token da parte inicial do cookie visível para o transporte da API', () => {
    document.cookie = `${CSRF_COOKIE_NAME}=browser-token.signature; Path=/; SameSite=Lax`

    useApiFetch()

    expect(captureTokenReader()).toBe('browser-token')
  })
})

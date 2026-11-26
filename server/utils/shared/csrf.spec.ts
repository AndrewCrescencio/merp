import { getCookie, getRequestHeader, setCookie, type H3Event } from 'h3'
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('h3', () => ({
  setCookie: vi.fn(),
  getCookie: vi.fn(),
  getRequestHeader: vi.fn(),
}))

// getCsrfSecret() lê process.env na hora da chamada — o stub tem que valer no
// momento do setCsrfCookie, não no import do módulo.
describe('CSRF secret (>= 32 em produção)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('recusa segredo ausente em produção', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CSRF_SECRET', '')
    const { setCsrfCookie } = await import('./csrf')

    expect(() => setCsrfCookie({} as never, 'tok')).toThrow(/>= 32 caracteres/)
  })

  it('recusa segredo curto em produção (não basta estar presente)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CSRF_SECRET', 'change-me')
    const { setCsrfCookie } = await import('./csrf')

    expect(() => setCsrfCookie({} as never, 'tok')).toThrow(/>= 32 caracteres/)
  })

  it('aceita segredo de >= 32 em produção', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CSRF_SECRET', 'a'.repeat(48))
    const { setCsrfCookie } = await import('./csrf')

    expect(() => setCsrfCookie({} as never, 'tok')).not.toThrow()
  })

  it('fora de produção o segredo não é exigido', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('CSRF_SECRET', '')
    const { setCsrfCookie } = await import('./csrf')

    expect(() => setCsrfCookie({} as never, 'tok')).not.toThrow()
  })
})

describe('validateCsrf', () => {
  it('recusa header com token diferente do cookie assinado', async () => {
    const { setCsrfCookie, validateCsrf } = await import('./csrf')
    const event = {} as H3Event
    const token = 'token-a'

    setCsrfCookie(event, token)
    const signedCookie = vi.mocked(setCookie).mock.lastCall?.[2]
    vi.mocked(getCookie).mockReturnValueOnce(signedCookie).mockReturnValueOnce(signedCookie)
    vi.mocked(getRequestHeader).mockReturnValueOnce(token).mockReturnValueOnce('token-b')

    expect(validateCsrf(event)).toBe(true)
    expect(validateCsrf(event)).toBe(false)
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('h3', () => ({
  setCookie: vi.fn(),
  getCookie: vi.fn(),
  getRequestHeader: vi.fn(),
}))

// getCsrfSecret() lê process.env na hora da chamada — o stub tem que valer no
// momento do setCsrfCookie, não no import do módulo.
describe('CSRF secret (AUD-24 — >= 32 em produção)', () => {
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

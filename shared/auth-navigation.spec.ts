import { describe, expect, it, vi } from 'vitest'
import { authenticateNavigation } from './auth-navigation'

describe('authenticated navigation', () => {
  it('allows public auth pages without a session request', async () => {
    const me = vi.fn()
    await authenticateNavigation('/auth/login', me, vi.fn())
    expect(me).not.toHaveBeenCalled()
  })

  it.each([401, 403])('redirects an anonymous navigation on %i', async (status) => {
    const redirect = vi.fn(() => '/auth/login')
    await expect(
      authenticateNavigation(
        '/',
        () => Promise.reject(Object.assign(new Error('unauthorized'), { status })),
        redirect,
      ),
    ).resolves.toBe('/auth/login')
    expect(redirect).toHaveBeenCalledOnce()
  })

  it('keeps an authenticated navigation and propagates unrelated failures', async () => {
    const redirect = vi.fn()
    await expect(authenticateNavigation('/', async () => ({ id: 'u1' }), redirect)).resolves.toBe(
      undefined,
    )
    const failure = Object.assign(new Error('unavailable'), { status: 503 })
    await expect(authenticateNavigation('/', () => Promise.reject(failure), redirect)).rejects.toBe(
      failure,
    )
    expect(redirect).not.toHaveBeenCalled()
  })
})

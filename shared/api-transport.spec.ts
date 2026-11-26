import { describe, expect, it, vi } from 'vitest'
import { createApiTransport, isInternalApiPath, type ApiFetchOptions } from './api-transport'

describe('API transport', () => {
  it('sends the CSRF token and preserves the fetch response', async () => {
    const fetcher = vi.fn(async (_url: string, _options: ApiFetchOptions) => ({ ok: true }))
    const api = createApiTransport(fetcher, () => 'csrf-token')

    await expect(api('/api/v1/example', { method: 'POST' })).resolves.toEqual({ ok: true })
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/example',
      expect.objectContaining({ method: 'POST', headers: expect.any(Headers) }),
    )
    expect((fetcher.mock.calls[0]?.[1] as { headers: Headers }).headers.get('x-csrf-token')).toBe(
      'csrf-token',
    )
  })

  it('keeps API error code, status and response data', async () => {
    const fetcher = vi.fn(async (_url: string, _options: ApiFetchOptions): Promise<never> => {
      throw { status: 409, data: { error: 'conflict', message: 'Taken' } }
    })
    const api = createApiTransport(fetcher, () => null)

    await expect(api('/api/v1/example')).rejects.toMatchObject({
      message: 'Taken',
      code: 'conflict',
      status: 409,
      data: { error: 'conflict', message: 'Taken' },
    })
  })

  it('forwards request context only for same-origin relative paths', () => {
    expect(isInternalApiPath('/api/v1/me')).toBe(true)
    expect(isInternalApiPath('https://example.com/api')).toBe(false)
    expect(isInternalApiPath('//example.com/api')).toBe(false)
    expect(isInternalApiPath('/\\example.com/api')).toBe(false)
  })
})

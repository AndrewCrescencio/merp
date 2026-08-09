import { describe, it, expect, vi, afterEach } from 'vitest'

const mockGetRequestIP = vi.fn()

vi.mock('h3', () => ({
  getRequestIP: mockGetRequestIP,
}))

const originalTrustProxy = process.env.TRUST_PROXY

afterEach(() => {
  if (originalTrustProxy === undefined) {
    delete process.env.TRUST_PROXY
  } else {
    process.env.TRUST_PROXY = originalTrustProxy
  }
  vi.resetModules()
})

async function loadGetClientIp(trustProxy: string | undefined) {
  if (trustProxy === undefined) {
    delete process.env.TRUST_PROXY
  } else {
    process.env.TRUST_PROXY = trustProxy
  }
  const { getClientIp } = await import('./ip')
  return getClientIp
}

describe('getClientIp', () => {
  it('does not trust X-Forwarded-For by default', async () => {
    mockGetRequestIP.mockReturnValue('10.0.0.5')

    const getClientIp = await loadGetClientIp(undefined)
    const event = {} as any

    expect(getClientIp(event)).toBe('10.0.0.5')
    expect(mockGetRequestIP).toHaveBeenCalledWith(event, { xForwardedFor: false })
  })

  it('trusts X-Forwarded-For only when TRUST_PROXY=true', async () => {
    mockGetRequestIP.mockReturnValue('203.0.113.7')

    const getClientIp = await loadGetClientIp('true')
    const event = {} as any

    expect(getClientIp(event)).toBe('203.0.113.7')
    expect(mockGetRequestIP).toHaveBeenCalledWith(event, { xForwardedFor: true })
  })

  it('ignores TRUST_PROXY values other than true', async () => {
    const getClientIp = await loadGetClientIp('1')
    const event = {} as any

    getClientIp(event)

    expect(mockGetRequestIP).toHaveBeenCalledWith(event, { xForwardedFor: false })
  })
})

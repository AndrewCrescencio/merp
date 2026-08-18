import { describe, it, expect, vi, afterEach } from 'vitest'

const mockGetRequestIP = vi.fn()

vi.mock('h3', () => ({
  getRequestIP: mockGetRequestIP,
}))

afterEach(() => {
  delete process.env.TRUST_PROXY
  delete process.env.TRUSTED_PROXY_CIDRS
  vi.resetModules()
})

async function loadGetClientIp(env: { TRUST_PROXY?: string; TRUSTED_PROXY_CIDRS?: string }) {
  if (env.TRUST_PROXY !== undefined) process.env.TRUST_PROXY = env.TRUST_PROXY
  if (env.TRUSTED_PROXY_CIDRS !== undefined) {
    process.env.TRUSTED_PROXY_CIDRS = env.TRUSTED_PROXY_CIDRS
  }
  return (await import('./ip')).getClientIp
}

function makeEvent(remoteAddress?: string) {
  return { node: { req: { socket: { remoteAddress } } } } as any
}

describe('getClientIp', () => {
  it('does not trust X-Forwarded-For by default', async () => {
    mockGetRequestIP.mockReturnValue('10.0.0.5')

    const getClientIp = await loadGetClientIp({})
    const event = makeEvent('10.0.0.5')

    expect(getClientIp(event)).toBe('10.0.0.5')
    expect(mockGetRequestIP).toHaveBeenCalledWith(event, { xForwardedFor: false })
  })

  it('trusts X-Forwarded-For when proxy flag is on and peer is in the trusted CIDRs', async () => {
    mockGetRequestIP.mockReturnValue('203.0.113.7')

    const getClientIp = await loadGetClientIp({
      TRUST_PROXY: 'true',
      TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
    })
    const event = makeEvent('10.0.0.9')

    expect(getClientIp(event)).toBe('203.0.113.7')
    expect(mockGetRequestIP).toHaveBeenCalledWith(event, { xForwardedFor: true })
  })

  it('ignores X-Forwarded-For when peer is outside the trusted CIDRs (fail-closed)', async () => {
    const getClientIp = await loadGetClientIp({
      TRUST_PROXY: 'true',
      TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
    })
    const event = makeEvent('203.0.113.7')

    getClientIp(event)

    expect(mockGetRequestIP).toHaveBeenCalledWith(event, { xForwardedFor: false })
  })

  it('ignores X-Forwarded-For when TRUST_PROXY=true but no CIDRs configured (fail-closed)', async () => {
    const getClientIp = await loadGetClientIp({ TRUST_PROXY: 'true' })
    const event = makeEvent('10.0.0.9')

    getClientIp(event)

    expect(mockGetRequestIP).toHaveBeenCalledWith(event, { xForwardedFor: false })
  })

  it('normalizes IPv4-mapped peer addresses before CIDR matching', async () => {
    const getClientIp = await loadGetClientIp({
      TRUST_PROXY: 'true',
      TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
    })
    const event = makeEvent('::ffff:10.0.0.9')

    getClientIp(event)

    expect(mockGetRequestIP).toHaveBeenCalledWith(event, { xForwardedFor: true })
  })

  it('accepts a bare IP entry as a single trusted proxy host', async () => {
    const getClientIp = await loadGetClientIp({
      TRUST_PROXY: 'true',
      TRUSTED_PROXY_CIDRS: '192.168.1.1',
    })
    const event = makeEvent('::ffff:192.168.1.1')

    getClientIp(event)

    expect(mockGetRequestIP).toHaveBeenCalledWith(event, { xForwardedFor: true })
  })

  it('ignores TRUST_PROXY values other than true', async () => {
    const getClientIp = await loadGetClientIp({
      TRUST_PROXY: '1',
      TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
    })
    const event = makeEvent('10.0.0.9')

    getClientIp(event)

    expect(mockGetRequestIP).toHaveBeenCalledWith(event, { xForwardedFor: false })
  })

  it('rejects malformed CIDR entries', async () => {
    process.env.TRUSTED_PROXY_CIDRS = '10.0.0.0/256'
    await expect(import('./ip')).rejects.toThrow(/TRUSTED_PROXY_CIDRS inválido/)

    process.env.TRUSTED_PROXY_CIDRS = 'not-an-ip/8'
    await expect(import('./ip')).rejects.toThrow(/TRUSTED_PROXY_CIDRS inválido/)
  })

  it('AUD-14: returns undefined instead of throwing when getRequestIP throws (no node)', async () => {
    mockGetRequestIP.mockImplementation(() => {
      throw new TypeError('event.node is undefined')
    })

    const getClientIp = await loadGetClientIp({})
    const event = {} as any

    expect(getClientIp(event)).toBeUndefined()
  })
})

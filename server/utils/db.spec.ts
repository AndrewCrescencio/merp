import { describe, it, expect, vi, afterEach } from 'vitest'

const originalNodeEnv = process.env.NODE_ENV

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv
  vi.resetModules()
})

async function loadWithRequiredSsl(nodeEnv: string) {
  process.env.NODE_ENV = nodeEnv
  return (await import('./db')).withRequiredSsl
}

describe('withRequiredSsl (AUD-05)', () => {
  it('forces sslmode=require in production when the URL has no sslmode', async () => {
    const withRequiredSsl = await loadWithRequiredSsl('production')
    expect(withRequiredSsl('postgres://merp:merp@postgres:5432/merp')).toBe(
      'postgres://merp:merp@postgres:5432/merp?sslmode=require',
    )
  })

  it('upgrades weak sslmodes (prefer/allow/disable) to require in production', async () => {
    const withRequiredSsl = await loadWithRequiredSsl('production')
    expect(withRequiredSsl('postgres://merp:merp@postgres:5432/merp?sslmode=prefer')).toBe(
      'postgres://merp:merp@postgres:5432/merp?sslmode=require',
    )
  })

  it('respects an explicit secure sslmode in production', async () => {
    const withRequiredSsl = await loadWithRequiredSsl('production')
    expect(withRequiredSsl('postgres://merp:merp@postgres:5432/merp?sslmode=verify-full')).toBe(
      'postgres://merp:merp@postgres:5432/merp?sslmode=verify-full',
    )
  })

  it('keeps the URL untouched outside production (dev/test local postgres)', async () => {
    const withRequiredSsl = await loadWithRequiredSsl('development')
    expect(withRequiredSsl('postgres://merp:merp@postgres:5432/merp')).toBe(
      'postgres://merp:merp@postgres:5432/merp',
    )
  })
})

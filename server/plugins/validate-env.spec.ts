import { describe, it, expect, vi } from 'vitest'

vi.mock('nitropack/runtime', () => ({
  defineNitroPlugin: (fn: any) => fn,
}))

import { missingProductionEnv } from './validate-env'

describe('missingProductionEnv (AUD-05)', () => {
  it('returns empty outside production', () => {
    expect(missingProductionEnv({ NODE_ENV: 'development' })).toEqual([])
  })

  it('flags missing CORS_ORIGIN, BETTER_AUTH_URL and APP_DATABASE_URL in production', () => {
    expect(missingProductionEnv({ NODE_ENV: 'production' })).toEqual([
      'CORS_ORIGIN',
      'BETTER_AUTH_URL',
      'APP_DATABASE_URL',
    ])
    expect(
      missingProductionEnv({
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://app.example.com',
        APP_DATABASE_URL: 'postgres://app:pw@db:5432/merp',
      }),
    ).toEqual(['BETTER_AUTH_URL'])
  })

  it('requires TRUSTED_PROXY_CIDRS when TRUST_PROXY=true in production', () => {
    expect(missingProductionEnv({ NODE_ENV: 'production', TRUST_PROXY: 'true' })).toContain(
      'TRUSTED_PROXY_CIDRS (obrigatória quando TRUST_PROXY=true)',
    )
    expect(
      missingProductionEnv({
        NODE_ENV: 'production',
        TRUST_PROXY: 'true',
        TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
      }),
    ).not.toContain('TRUSTED_PROXY_CIDRS (obrigatória quando TRUST_PROXY=true)')
  })

  it('throws on malformed CIDR even in the missing check', () => {
    expect(() =>
      missingProductionEnv({
        NODE_ENV: 'production',
        TRUST_PROXY: 'true',
        TRUSTED_PROXY_CIDRS: 'x/8',
      }),
    ).toThrow(/TRUSTED_PROXY_CIDRS inválido/)
  })

  it('is satisfied when everything is set', () => {
    expect(
      missingProductionEnv({
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://app.example.com',
        BETTER_AUTH_URL: 'https://app.example.com',
        APP_DATABASE_URL: 'postgres://app:pw@db:5432/merp',
        TRUST_PROXY: 'false',
      }),
    ).toEqual([])
  })
})

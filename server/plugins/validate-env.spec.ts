import { describe, it, expect, vi } from 'vitest'

import { missingProductionEnv } from './validate-env'

vi.mock('nitropack/runtime', () => ({
  defineNitroPlugin: (fn: any) => fn,
}))

describe('missingProductionEnv (AUD-05 + AUD-24)', () => {
  it('returns empty outside production (BETTER_AUTH_SECRET ausente = ok)', () => {
    expect(missingProductionEnv({ NODE_ENV: 'development' })).toEqual([])
  })

  it('flags missing CORS_ORIGIN, BETTER_AUTH_URL, APP_DATABASE_URL and BETTER_AUTH_SECRET in production', () => {
    expect(missingProductionEnv({ NODE_ENV: 'production' })).toEqual([
      'CORS_ORIGIN',
      'BETTER_AUTH_URL',
      'APP_DATABASE_URL',
      'BETTER_AUTH_SECRET (mínimo 32 caracteres)',
    ])
    expect(
      missingProductionEnv({
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://app.example.com',
        APP_DATABASE_URL: 'postgres://app:pw@db:5432/merp',
      }),
    ).toEqual(['BETTER_AUTH_URL', 'BETTER_AUTH_SECRET (mínimo 32 caracteres)'])
  })

  it('AUD-24: flags BETTER_AUTH_SECRET with fewer than 32 characters in production', () => {
    expect(
      missingProductionEnv({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'short-secret' }),
    ).toContain('BETTER_AUTH_SECRET (mínimo 32 caracteres)')
    expect(
      missingProductionEnv({
        NODE_ENV: 'production',
        BETTER_AUTH_SECRET: 'a'.repeat(31),
      }),
    ).toContain('BETTER_AUTH_SECRET (mínimo 32 caracteres)')
  })

  it('AUD-24: accepts BETTER_AUTH_SECRET with length >= 32 in production', () => {
    expect(
      missingProductionEnv({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'a'.repeat(32) }),
    ).not.toContain('BETTER_AUTH_SECRET (mínimo 32 caracteres)')
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
        BETTER_AUTH_SECRET: 'a'.repeat(32),
        TRUST_PROXY: 'false',
      }),
    ).toEqual([])
  })
})

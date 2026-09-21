import { describe, it, expect } from 'vitest'
import {
  MAX_REQUESTS_PER_USER,
  evaluateLockout,
  evaluateRateLimit,
  isValidCnpj,
  isWeakPassword,
  normalizeEmail,
} from './security'

describe('normalizeEmail', () => {
  it('trims whitespace and lowercases', () => {
    expect(normalizeEmail('  Foo@Bar.com  ')).toBe('foo@bar.com')
  })

  it('keeps already normalized emails unchanged', () => {
    expect(normalizeEmail('foo@bar.com')).toBe('foo@bar.com')
  })
})

describe('isWeakPassword', () => {
  it('flags common passwords case-insensitively', () => {
    expect(isWeakPassword('Password123')).toBe(true)
    expect(isWeakPassword('qwerty')).toBe(true)
  })

  it('accepts non-common passwords', () => {
    expect(isWeakPassword('Str0ngP@ssw0rd!2026')).toBe(false)
  })
})

describe('isValidCnpj', () => {
  it('accepts a valid CNPJ with and without mask', () => {
    expect(isValidCnpj('11222333000181')).toBe(true)
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
  })

  it('rejects wrong check digits', () => {
    expect(isValidCnpj('12345678000190')).toBe(false)
    expect(isValidCnpj('12345678901234')).toBe(false)
  })

  it('rejects wrong length and repeated digits', () => {
    expect(isValidCnpj('123')).toBe(false)
    expect(isValidCnpj('')).toBe(false)
    expect(isValidCnpj('00000000000000')).toBe(false)
    expect(isValidCnpj('11.222.333/0001-8')).toBe(false)
  })
})

describe('evaluateRateLimit', () => {
  const now = new Date('2026-08-02T12:00:00.000Z')
  const t = (sec: number) => new Date(now.getTime() + sec * 1000).toISOString()

  it('allows the first request and opens the window', () => {
    const result = evaluateRateLimit(null, now)

    expect(result).toEqual({
      allowed: true,
      nextWindow: [now.toISOString()],
    })
  })

  it('allows requests while fewer than 5 hits in the last 60s', () => {
    const entry = { window: [t(-30), t(-20), t(-10), t(-5)] }

    const result = evaluateRateLimit(entry, now)

    expect(result.allowed).toBe(true)
    expect(result.nextWindow).toEqual([...entry.window, now.toISOString()])
  })

  it('blocks the 6th request within 60s with retryAfter (FR-010)', () => {
    const entry = { window: [t(-50), t(-40), t(-30), t(-20), t(-10)] }

    const result = evaluateRateLimit(entry, now)

    expect(result.allowed).toBe(false)
    // o hit mais antigo sai da janela em 10s
    expect(result.retryAfter).toBe(10)
  })

  it('sliding window: drops hits older than 60s before counting', () => {
    // 5 hits, mas o mais antigo já saiu da janela de 60s
    const entry = { window: [t(-61), t(-40), t(-30), t(-20), t(-10)] }

    const result = evaluateRateLimit(entry, now)

    expect(result.allowed).toBe(true)
    expect(result.nextWindow).toEqual([t(-40), t(-30), t(-20), t(-10), now.toISOString()])
  })

  it('no burst across adjacent fixed windows: 5 hits at 59s ago still block', () => {
    const entry = { window: [t(-59), t(-40), t(-30), t(-20), t(-10)] }

    const result = evaluateRateLimit(entry, now)

    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBe(1)
  })

  it('applies a different cap when maxRequests is provided (per-IP)', () => {
    const allowed = evaluateRateLimit({ window: [t(-5), t(-4)] }, now, 20)
    expect(allowed.allowed).toBe(true)

    const blocked = evaluateRateLimit(
      { window: [t(-59), t(-50), t(-40), t(-30), t(-20), t(-10)] },
      now,
      5,
    )
    expect(blocked.allowed).toBe(false)
  })

  it('AUD-16: applies the per-user cap (MAX_REQUESTS_PER_USER = 60)', () => {
    // 59 hits na janela: abaixo do teto de 60.
    const hits = Array.from({ length: 59 }, (_, i) => t(-59 + i))

    const allowed = evaluateRateLimit({ window: hits }, now, MAX_REQUESTS_PER_USER)
    expect(allowed.allowed).toBe(true)
    expect(allowed.nextWindow.length).toBe(60)

    const blocked = evaluateRateLimit({ window: [...hits, t(-1)] }, now, MAX_REQUESTS_PER_USER)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBe(1)
  })

  it('AUD-16: drops hits older than 60s before counting the per-user window', () => {
    // 60 hits, mas o mais antigo (-61s) já saiu da janela — só 59 contam.
    const hits = [t(-61), ...Array.from({ length: 59 }, (_, i) => t(-59 + i))]

    const result = evaluateRateLimit({ window: hits }, now, MAX_REQUESTS_PER_USER)
    expect(result.allowed).toBe(true)
    expect(result.nextWindow.length).toBe(60)
  })
})

describe('evaluateLockout', () => {
  const now = new Date('2026-08-02T12:00:00.000Z')

  it('does not lock before 10 failures', () => {
    const result = evaluateLockout(3, null, now)

    expect(result.locked).toBe(false)
    expect(result.nextAttempts).toBe(4)
    expect(result.nextLockedUntil).toBeNull()
  })

  it('locks for 30 minutes at the 10th failure', () => {
    const result = evaluateLockout(9, null, now)

    expect(result.locked).toBe(false)
    expect(result.nextAttempts).toBe(10)
    expect(result.nextLockedUntil).toEqual(new Date('2026-08-02T12:30:00.000Z'))
  })

  it('reports locked while lockedUntil is in the future', () => {
    const result = evaluateLockout(10, new Date('2026-08-02T12:30:00.000Z'), now)

    expect(result.locked).toBe(true)
    expect(result.nextAttempts).toBe(10)
    expect(result.nextLockedUntil).toEqual(new Date('2026-08-02T12:30:00.000Z'))
  })

  it('resets the counter once the lockout expires', () => {
    const result = evaluateLockout(10, new Date('2026-08-02T11:00:00.000Z'), now)

    expect(result.locked).toBe(false)
    expect(result.nextAttempts).toBe(1)
    expect(result.nextLockedUntil).toBeNull()
  })

  it('locks at the 50th failure when maxAttempts is raised (global tier, AUD-02)', () => {
    const result = evaluateLockout(49, null, now, 50)

    expect(result.locked).toBe(false)
    expect(result.nextAttempts).toBe(50)
    expect(result.nextLockedUntil).toEqual(new Date('2026-08-02T12:30:00.000Z'))
  })
})

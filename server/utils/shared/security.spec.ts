import { describe, it, expect } from 'vitest'
import { evaluateLockout, evaluateRateLimit } from './security'

describe('evaluateRateLimit', () => {
  const now = new Date('2026-08-02T12:00:00.000Z')

  it('allows the first request and opens a 60s window', () => {
    const result = evaluateRateLimit(null, now)

    expect(result).toEqual({
      allowed: true,
      nextCount: 1,
      nextResetAt: new Date('2026-08-02T12:01:00.000Z'),
    })
  })

  it('allows requests while count is below the 5-request cap', () => {
    const entry = { count: 4, resetAt: new Date('2026-08-02T12:01:00.000Z') }

    const result = evaluateRateLimit(entry, now)

    expect(result.allowed).toBe(true)
    expect(result.nextCount).toBe(5)
    expect(result.nextResetAt).toBe(entry.resetAt)
  })

  it('blocks the 6th request in the same window with retryAfter (FR-010)', () => {
    const entry = { count: 5, resetAt: new Date('2026-08-02T12:01:00.000Z') }

    const result = evaluateRateLimit(entry, now)

    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBe(60)
    expect(result.nextCount).toBe(5)
  })

  it('opens a fresh window after resetAt elapses', () => {
    const entry = { count: 5, resetAt: new Date('2026-08-02T11:59:00.000Z') }

    const result = evaluateRateLimit(entry, now)

    expect(result.allowed).toBe(true)
    expect(result.nextCount).toBe(1)
    expect(result.nextResetAt.getTime()).toBe(now.getTime() + 60_000)
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
})

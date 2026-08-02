import { describe, it, expect } from 'vitest'
import {
  assertCompanyRole,
  classifyDatabaseError,
  evaluateLockout,
  evaluateRateLimit,
  handleDatabaseError,
} from './helpers'

describe('assertCompanyRole', () => {
  it('throws 403 when role is null (not a member)', async () => {
    await expect(assertCompanyRole(null, 'owner', 'You are not a member')).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('throws 403 when role is undefined', async () => {
    await expect(
      assertCompanyRole(undefined, 'owner', 'You are not a member'),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('throws 403 when role does not match requiredRole', async () => {
    await expect(
      assertCompanyRole('member', 'owner', 'You are not a member', 'Only owners'),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('falls back to notMemberMessage when wrongRoleMessage is omitted', async () => {
    await expect(assertCompanyRole('member', 'owner', 'You are not a member')).rejects.toThrow(
      'You are not a member',
    )
  })

  it('passes when role matches requiredRole', async () => {
    await expect(
      assertCompanyRole('owner', 'owner', 'You are not a member'),
    ).resolves.toBeUndefined()
  })

  it('passes with requiredRole null for any member role', async () => {
    await expect(assertCompanyRole('member', null, 'You are not a member')).resolves.toBeUndefined()
    await expect(assertCompanyRole('owner', null, 'You are not a member')).resolves.toBeUndefined()
  })
})

describe('classifyDatabaseError', () => {
  it('maps 42501 (insufficient_privilege) to 403 forbidden', () => {
    const result = classifyDatabaseError({ code: '42501' })

    expect(result).toEqual({
      status: 403,
      error: 'forbidden',
      message: 'You do not have permission to access this resource',
    })
  })

  it('maps P0001 (policy function error) to 403 forbidden', () => {
    expect(classifyDatabaseError({ code: 'P0001' }).status).toBe(403)
  })

  it('maps 42501 wrapped in cause (DrizzleQueryError shape) to 403', () => {
    expect(classifyDatabaseError({ cause: { code: '42501' } }).status).toBe(403)
  })

  it('maps connection errors without a code to 503', () => {
    expect(classifyDatabaseError(new Error('connection refused')).status).toBe(503)
  })

  it('maps ECONNREFUSED to 503', () => {
    expect(classifyDatabaseError({ code: 'ECONNREFUSED' }).status).toBe(503)
  })

  it('maps 23505 to 503 (not RLS; conflicts handled by callers)', () => {
    expect(classifyDatabaseError({ code: '23505' }).status).toBe(503)
  })
})

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

describe('handleDatabaseError', () => {
  it('throws 403 for RLS violations', () => {
    expect(() => handleDatabaseError({ code: '42501' })).toThrowError(
      expect.objectContaining({ statusCode: 403 }),
    )
  })

  it('throws 503 for non-RLS errors', () => {
    expect(() => handleDatabaseError(new Error('connection refused'))).toThrowError(
      expect.objectContaining({ statusCode: 503 }),
    )
  })
})

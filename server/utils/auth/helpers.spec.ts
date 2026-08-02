import { describe, it, expect } from 'vitest'
import { assertCompanyRole, classifyDatabaseError, handleDatabaseError } from './helpers'

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

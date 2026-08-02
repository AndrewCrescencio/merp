import { describe, it, expect } from 'vitest'
import { assertCompanyRole } from './helpers'

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

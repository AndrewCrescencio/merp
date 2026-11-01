import { createError } from 'h3'
import { membershipRepository } from './membership'

/**
 * Asserts the user has at least one of the required roles for the company.
 * Throws 403 if not authorized.
 */
export async function assertCompanyRole(
  companyId: string,
  userId: string,
  allowedRoles: string[],
): Promise<void> {
  const role = await membershipRepository.getCompanyMembershipRole(userId, companyId)
  if (!role) {
    throw createError({
      status: 403,
      message: JSON.stringify({
        error: 'forbidden',
        message: 'You are not a member of this company',
      }),
    })
  }

  if (!allowedRoles.includes(role)) {
    throw createError({
      status: 403,
      message: JSON.stringify({
        error: 'forbidden',
        message: 'Insufficient permissions for this action',
      }),
    })
  }
}

/**
 * Asserts the user is a member of the company (any role).
 * Throws 403 if not a member.
 */
export async function assertCompanyMember(companyId: string, userId: string): Promise<void> {
  const role = await membershipRepository.getCompanyMembershipRole(userId, companyId)
  if (!role) {
    throw createError({
      status: 403,
      message: JSON.stringify({
        error: 'forbidden',
        message: 'You are not a member of this company',
      }),
    })
  }
}

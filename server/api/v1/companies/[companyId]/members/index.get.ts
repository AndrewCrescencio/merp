import { defineEventHandler } from 'h3'
import { requireTenant, requireUser } from '~~/server/utils/shared/auth-context'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId } = requireTenant(event)
  const user = requireUser(event)

  // Only owner/manager can list members
  await assertCompanyRole(companyId, user.id, ['owner', 'manager'])

  const members = await membershipRepository.listCompanyMembers(companyId, user.id)

  return { members }
})

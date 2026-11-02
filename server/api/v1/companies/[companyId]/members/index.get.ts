import { defineEventHandler } from 'h3'
import { requireUser } from '~~/server/utils/shared/auth-context'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId } = event.context.params as { companyId: string }
  const user = requireUser(event)

  // Only owner/manager can list members
  await assertCompanyRole(companyId, user.id, ['owner', 'manager'])

  const members = await membershipRepository.findUserCompanies(user.id)
  const memberDetails = await Promise.all(
    members.map(async (m) => {
      const details = await membershipRepository.getCompanyMembershipWithDetails(m.id, companyId)
      return {
        userId: m.id,
        name: m.name,
        role: m.role,
        defaultLocationId: details?.defaultLocationId,
      }
    }),
  )

  return { members: memberDetails }
})

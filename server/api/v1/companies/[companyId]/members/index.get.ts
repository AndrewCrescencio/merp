import { defineEventHandler } from 'h3'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'

export default defineEventHandler(async (event) => {
  const { companyId } = event.context.params as { companyId: string }
  const auth = await requireTenant(event)

  // Only owner/manager can list members
  await assertCompanyRole(companyId, auth.user.id, ['owner', 'manager'])

  const members = await membershipRepository.findUserCompanies(auth.user.id)
  const memberDetails = await Promise.all(
    members.map(async (m) => {
      const details = await membershipRepository.getCompanyMembershipWithDetails(m.id, companyId)
      return {
        userId: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        defaultLocationId: details?.defaultLocationId,
      }
    }),
  )

  return { members: memberDetails }
})

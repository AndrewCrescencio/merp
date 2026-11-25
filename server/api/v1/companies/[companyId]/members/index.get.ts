import { membershipRepository } from '~~/server/utils/auth/company/membership'
import { defineAuthHandler, ROLES } from '~~/server/utils/shared'

export default defineAuthHandler(
  { tenant: true, role: ROLES.owner, forbiddenMessage: 'Only company owners can list members' },
  async ({ tenant, user }) => {
    const members = await membershipRepository.listCompanyMembers(tenant.companyId, user.id)
    return { members }
  },
)

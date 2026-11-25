import { getRouterParam, sendNoContent } from 'h3'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
import {
  assertRole,
  createAuthEvent,
  getClientIp,
  defineAuthHandler,
  ROLES,
  sendForbiddenError,
  sendNotFoundError,
} from '~~/server/utils/shared'

export default defineAuthHandler(
  { tenant: true, role: 'any' },
  async ({ event, user, tenant: { companyId, role } }) => {
    const userId = getRouterParam(event, 'userId')
    if (!userId) sendNotFoundError('Company member not found')

    if (userId === user.id) {
      if (role === ROLES.owner) sendForbiddenError('Cannot remove a company owner')
    } else {
      assertRole(
        role,
        ROLES.owner,
        'You are not a member of this company',
        'Only company owners can remove members',
      )
      const targetRole = await membershipRepository.getCompanyMembershipRole(userId, companyId)
      if (!targetRole) sendNotFoundError('Company member not found')
      if (targetRole === ROLES.owner) sendForbiddenError('Cannot remove a company owner')
    }

    await membershipRepository.removeCompanyMember(companyId, user.id, userId)
    await createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'member_removed',
      ipAddress: getClientIp(event) || null,
      metadata: { companyId, removedUserId: userId },
    })
    return sendNoContent(event)
  },
)

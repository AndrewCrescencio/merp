import { getRouterParam, sendNoContent } from 'h3'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
import {
  assertRole,
  createAuthEvent,
  getClientIp,
  defineAuthHandler,
  ROLES,
  requireTenant,
  sendForbiddenError,
  sendNotFoundError,
} from '~~/server/utils/shared'

export default defineAuthHandler(async (event, user) => {
  // companyId e userId vêm do path; nenhum id no body.
  const { companyId, role } = requireTenant(event)
  const userId = getRouterParam(event, 'userId')

  if (!userId) {
    sendNotFoundError('Company member not found')
  }

  const emitRemoval = (removedUserId: string) =>
    createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'member_removed',
      ipAddress: getClientIp(event) || null,
      metadata: { companyId, removedUserId },
    })

  // Auto-remoção (sair da empresa): qualquer membro, exceto o owner.
  if (userId === user.id) {
    await assertRole(role, null, 'You are not a member of this company')

    if (role === ROLES.owner) {
      sendForbiddenError('Cannot remove a company owner')
    }

    await membershipRepository.removeCompanyMember(companyId, user.id, user.id)
    await emitRemoval(user.id)

    // DELETE responde 204 sem corpo.
    return sendNoContent(event)
  }

  // Remover outro membro: exige owner.
  await assertRole(
    role,
    ROLES.owner,
    'You are not a member of this company',
    'Only company owners can remove members',
  )

  const targetRole = await membershipRepository.getCompanyMembershipRole(userId, companyId)
  if (!targetRole) {
    sendNotFoundError('Company member not found')
  }

  if (targetRole === ROLES.owner) {
    sendForbiddenError('Cannot remove a company owner')
  }

  await membershipRepository.removeCompanyMember(companyId, user.id, userId)
  await emitRemoval(userId)

  // DELETE responde 204 sem corpo.
  return sendNoContent(event)
})

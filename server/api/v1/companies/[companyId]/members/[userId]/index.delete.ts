import { defineEventHandler, getRouterParam } from 'h3'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
import {
  assertCompanyRole,
  createAuthEvent,
  getClientIp,
  sendForbiddenError,
  sendNotFoundError,
  sendUnauthorizedError,
  requireTenant,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  // companyId e userId vêm do path (R1); nenhum id no body.
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
    await assertCompanyRole(role, null, 'You are not a member of this company')

    if (role === 'owner') {
      sendForbiddenError('Cannot remove a company owner')
    }

    await membershipRepository.removeCompanyMember(companyId, user.id, user.id)
    await emitRemoval(user.id)

    return { message: 'Left company successfully' }
  }

  // Remover outro membro: exige owner.
  await assertCompanyRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can remove members',
  )

  const targetRole = await membershipRepository.getCompanyMembershipRole(userId, companyId)
  if (!targetRole) {
    sendNotFoundError('Company member not found')
  }

  if (targetRole === 'owner') {
    sendForbiddenError('Cannot remove a company owner')
  }

  await membershipRepository.removeCompanyMember(companyId, user.id, userId)
  await emitRemoval(userId)

  return { message: 'Member removed successfully' }
})

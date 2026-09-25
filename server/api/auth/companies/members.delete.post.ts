import { defineEventHandler, readBody } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import {
  assertCompanyRole,
  createAuthEvent,
  getClientIp,
  sendForbiddenError,
  sendNotFoundError,
  sendUnauthorizedError,
  validateRemoveMemberInput,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  const { companyId, userId } = validateRemoveMemberInput(await readBody(event))

  const company = await companyRepository.findCompanyById(companyId, user.id)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  const role = await companyRepository.getCompanyMembershipRole(user.id, companyId)

  if (!userId) {
    await assertCompanyRole(role, null, 'You are not a member of this company')

    if (role === 'owner') {
      sendForbiddenError('Cannot remove a company owner')
    }

    await companyRepository.removeCompanyMember(companyId, user.id, user.id)

    const ip = getClientIp(event)
    await createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'member_removed',
      ipAddress: ip || null,
      metadata: { companyId, removedUserId: user.id },
    })

    return { message: 'Left company successfully' }
  }

  await assertCompanyRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can remove members',
  )

  const targetRole = await companyRepository.getCompanyMembershipRole(userId, companyId)
  if (!targetRole) {
    sendNotFoundError('Company member not found')
  }

  if (targetRole === 'owner') {
    sendForbiddenError('Cannot remove a company owner')
  }

  await companyRepository.removeCompanyMember(companyId, user.id, userId)

  const ip = getClientIp(event)
  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'member_removed',
    ipAddress: ip || null,
    metadata: { companyId, removedUserId: userId },
  })

  return { message: 'Member removed successfully' }
})

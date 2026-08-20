import { defineEventHandler, readBody, createError } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import { createAuthEvent } from '~~/server/utils/shared/audit'
import { getClientIp } from '~~/server/utils/shared/ip'
import {
  sendValidationError,
  sendNotFoundError,
  sendForbiddenError,
  assertCompanyRole,
} from '~~/server/utils/shared/errors'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const body = await readBody<{ companyId?: string; userId?: string }>(event)

  if (!body?.companyId || typeof body.companyId !== 'string') {
    sendValidationError('companyId is required')
  }

  if (body.userId !== undefined && (typeof body.userId !== 'string' || body.userId.trim() === '')) {
    sendValidationError('userId must be a non-empty string')
  }

  const company = await companyRepository.findCompanyById(body.companyId, user.id)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  const role = await companyRepository.getCompanyMembershipRole(user.id, body.companyId)

  if (!body.userId) {
    // Leave: o member remove a si mesmo
    await assertCompanyRole(role, null, 'You are not a member of this company')

    if (role === 'owner') {
      sendForbiddenError('Cannot remove a company owner')
    }

    await companyRepository.removeCompanyMember(body.companyId, user.id, user.id)

    const ip = getClientIp(event)
    await createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'member_removed',
      ipAddress: ip || null,
      metadata: { companyId: body.companyId, removedUserId: user.id },
    })

    return { message: 'Left company successfully' }
  }

  // Owner remove outro member
  await assertCompanyRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can remove members',
  )

  const targetRole = await companyRepository.getCompanyMembershipRole(body.userId, body.companyId)
  if (!targetRole) {
    sendNotFoundError('Company member not found')
  }

  if (targetRole === 'owner') {
    sendForbiddenError('Cannot remove a company owner')
  }

  await companyRepository.removeCompanyMember(body.companyId, user.id, body.userId)

  const ip = getClientIp(event)
  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'member_removed',
    ipAddress: ip || null,
    metadata: { companyId: body.companyId, removedUserId: body.userId },
  })

  return { message: 'Member removed successfully' }
})

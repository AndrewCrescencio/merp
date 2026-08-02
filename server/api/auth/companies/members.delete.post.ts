import { defineEventHandler, readBody, createError, getRequestIP } from 'h3'
import { authRepository } from '~~/server/utils/auth/repository'
import {
  sendValidationError,
  sendNotFoundError,
  sendForbiddenError,
  assertCompanyRole,
} from '~~/server/utils/auth/helpers'

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

  const company = await authRepository.findCompanyById(body.companyId)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  const role = await authRepository.getCompanyMembershipRole(user.id, body.companyId)

  if (!body.userId) {
    // Leave: o member remove a si mesmo
    await assertCompanyRole(role, null, 'You are not a member of this company')

    if (role === 'owner') {
      sendForbiddenError('Cannot remove a company owner')
    }

    await authRepository.removeCompanyMember(body.companyId, user.id, user.id)

    const ip = getRequestIP(event, { xForwardedFor: true })
    await authRepository.createAuthEvent({
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

  const targetRole = await authRepository.getCompanyMembershipRole(body.userId, body.companyId)
  if (!targetRole) {
    sendNotFoundError('Company member not found')
  }

  if (targetRole === 'owner') {
    sendForbiddenError('Cannot remove a company owner')
  }

  await authRepository.removeCompanyMember(body.companyId, user.id, body.userId)

  const ip = getRequestIP(event, { xForwardedFor: true })
  await authRepository.createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'member_removed',
    ipAddress: ip || null,
    metadata: { companyId: body.companyId, removedUserId: body.userId },
  })

  return { message: 'Member removed successfully' }
})

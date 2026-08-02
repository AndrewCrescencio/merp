import { defineEventHandler, readBody, createError, getRequestIP } from 'h3'
import { authRepository } from '~~/server/utils/auth/repository'
import {
  sendValidationError,
  sendNotFoundError,
  sendForbiddenError,
} from '~~/server/utils/auth/helpers'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const body = await readBody<{ companyId?: string; email?: string }>(event)

  if (!body?.companyId || typeof body.companyId !== 'string') {
    sendValidationError('companyId is required')
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !EMAIL_REGEX.test(email)) {
    sendValidationError('A valid email is required')
  }

  const company = await authRepository.findCompanyById(body.companyId)
  if (!company) {
    sendNotFoundError('Company not found')
  }

  const role = await authRepository.getCompanyMembershipRole(user.id, body.companyId)
  if (!role) {
    sendForbiddenError('You are not a member of this company')
  }
  if (role !== 'owner') {
    sendForbiddenError('Only company owners can invite members')
  }

  const created = await authRepository.createInvite({
    companyId: body.companyId,
    email: email!,
    invitedBy: user.id,
  })

  const ip = getRequestIP(event, { xForwardedFor: true })
  await authRepository.createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'invite_created',
    ipAddress: ip || null,
    metadata: { companyId: body.companyId, invitedEmail: email },
  })

  return {
    id: created.id,
    companyId: created.companyId,
    email: created.email,
    expiresAt: created.expiresAt,
  }
})

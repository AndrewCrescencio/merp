import { defineEventHandler, readBody, createError, getRequestIP } from 'h3'
import { authRepository } from '~~/server/utils/auth/repository'
import { sendValidationError, sendNotFoundError } from '~~/server/utils/auth/helpers'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const body = await readBody<{ companyId?: string }>(event)

  if (!body?.companyId || typeof body.companyId !== 'string') {
    sendValidationError('companyId is required')
  }

  const invite = await authRepository.findPendingInvite(body.companyId, user.email)
  if (!invite) {
    sendNotFoundError('Invite not found or expired')
  }

  const accepted = await authRepository.acceptInvite(body.companyId, user.email, user.id)

  const ip = getRequestIP(event, { xForwardedFor: true })
  await authRepository.createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'invite_accepted',
    ipAddress: ip || null,
    metadata: { companyId: body.companyId },
  })

  return {
    id: accepted.id,
    companyId: accepted.companyId,
    acceptedAt: accepted.acceptedAt,
  }
})

import { defineEventHandler, readBody, createError } from 'h3'
import { inviteRepository } from '~~/server/utils/auth/invite/repository'
import { sendValidationError, sendNotFoundError } from '~~/server/utils/shared/errors'
import { createAuthEvent } from '~~/server/utils/shared/audit'
import { getClientIp } from '~~/server/utils/shared/ip'

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

  const invite = await inviteRepository.findPendingInvite(body.companyId, user.email)
  if (!invite) {
    sendNotFoundError('Invite not found or expired')
  }

  const accepted = await inviteRepository.acceptInvite(body.companyId, user.email, user.id)

  const ip = getClientIp(event)
  await createAuthEvent({
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

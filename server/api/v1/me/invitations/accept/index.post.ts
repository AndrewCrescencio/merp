import { defineEventHandler, readBody } from 'h3'
import { inviteRepository } from '~~/server/utils/auth/invite/repository'
import {
  checkIpRateLimit,
  createAuthEvent,
  getClientIp,
  sendUnauthorizedError,
  validateInviteAcceptInput,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const user = event.context.user as { id: string; email: string } | undefined
  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  const { token } = validateInviteAcceptInput(await readBody(event))

  const accepted = await inviteRepository.acceptInvite(token, user.email, user.id)

  const ip = getClientIp(event)
  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'invite_accepted',
    ipAddress: ip || null,
    metadata: { companyId: accepted.companyId },
  })

  return {
    id: accepted.id,
    companyId: accepted.companyId,
    acceptedAt: accepted.acceptedAt,
  }
})

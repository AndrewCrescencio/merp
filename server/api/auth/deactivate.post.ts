import { defineEventHandler } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import { createAuthEvent, getClientIp, sendUnauthorizedError } from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined

  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  await identityRepository.deactivateUser(user.id)

  const ip = getClientIp(event)
  const session = event.context.session as
    | { id: string; activeCompanyId?: string | null }
    | undefined

  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'session_invalidated',
    ipAddress: ip || null,
    metadata: {
      sessionId: session?.id ?? null,
      userId: user.id,
      tenantId: session?.activeCompanyId ?? null,
    },
  })

  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'deactivation',
    ipAddress: ip || null,
  })

  return { message: 'Account deactivated successfully' }
})

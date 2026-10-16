import { defineEventHandler } from 'h3'
import { createAuthEvent, getClientIp, sendUnauthorizedError } from '~~/server/utils/shared'
import { deactivateUser } from '~~/server/utils/auth/identity/queries'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined

  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  // FR-017: soft delete de verdade — sem este UPDATE o usuário continuava
  // ativo e voltava a logar com sessão nova.
  await deactivateUser(user.id)

  const ip = getClientIp(event)
  const session = event.context.session as
    { id: string; activeCompanyId?: string | null } | undefined

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
  })

  return { message: 'Account deactivated successfully' }
})

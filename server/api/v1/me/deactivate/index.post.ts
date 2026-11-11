import { createAuthEvent, getClientIp, defineAuthHandler } from '~~/server/utils/shared'
import { deactivateUser } from '~~/server/utils/auth/identity/queries'

export default defineAuthHandler(async (event, user) => {
  // soft delete de verdade — sem este UPDATE o usuário continuava
  // ativo e voltava a logar com sessão nova.
  await deactivateUser(user.id)

  const ip = getClientIp(event)
  const session = event.context.session as { id: string } | undefined

  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'session_invalidated',
    ipAddress: ip || null,
    metadata: {
      sessionId: session?.id ?? null,
      userId: user.id,
    },
  })

  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'deactivation',
  })

  return { message: 'Account deactivated successfully' }
})

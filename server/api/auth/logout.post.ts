import { defineEventHandler, getRequestIP } from 'h3'
import { auth } from '#shared/auth'
import { authRepository } from '~~/server/utils/auth/repository'
import { sendUnauthorizedError } from '~~/server/utils/auth/helpers'

export default defineEventHandler(async (event) => {
  const session = event.context.session as { id: string } | undefined
  const user = event.context.user as { id: string; email: string } | undefined

  if (!session) {
    sendUnauthorizedError('No active session.')
  }

  await auth.api.signOut({
    headers: event.headers,
  })

  const ip = getRequestIP(event, { xForwardedFor: true })

  // FR-023: session_invalidated — sessão encerrada pelo logout.
  await authRepository.createAuthEvent({
    userId: user?.id ?? null,
    email: user?.email ?? 'unknown',
    eventType: 'session_invalidated',
    ipAddress: ip || null,
    metadata: {
      sessionId: session?.id ?? null,
      userId: user?.id ?? null,
      tenantId: (session as any)?.activeCompanyId ?? null,
    },
  })

  if (user) {
    await authRepository.createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'logout',
      ipAddress: ip || null,
    })
  }

  return { message: 'Logged out successfully' }
})

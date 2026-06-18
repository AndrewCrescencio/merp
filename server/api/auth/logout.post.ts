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

  if (user) {
    const ip = getRequestIP(event, { xForwardedFor: true })
    await authRepository.createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'logout',
      ipAddress: ip || null,
    })
  }

  return { message: 'Logged out successfully' }
})

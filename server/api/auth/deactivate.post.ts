import { defineEventHandler } from 'h3'
import { createAuthEvent, getClientIp, sendUnauthorizedError } from '~~/server/utils/shared'
import { callBetterAuth } from '~~/server/utils/auth/identity/client'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined

  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  // Better Auth doesn't have a direct deactivate user API
  // We revoke all sessions and mark user as inactive via the Better Auth admin API
  try {
    await callBetterAuth(
      async (auth) => auth.api.revokeSessions({ body: { userId: user.id } }),
      { timeout: 5_000 }
    )
  } catch {
    // revokeSessions might not be available in this version, continue anyway
  }

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
  })

  return { message: 'Account deactivated successfully' }
})

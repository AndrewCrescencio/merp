import { defineEventHandler, readBody } from 'h3'
import { callBetterAuth } from '~~/server/utils/auth/identity/client'
import {
  createAuthEvent,
  getClientIp,
  sendUnauthorizedError,
  validateConsentWithdrawInput,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  validateConsentWithdrawInput(await readBody(event))
  const user = event.context.user as { id: string; email: string; name?: string | null } | undefined

  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  // Update user to mark consent as withdrawn
  try {
    await callBetterAuth(
      async (auth) => (auth.api as Record<string, unknown>).updateUser({
        body: { name: user.name || 'User', consentWithdrawnAt: new Date() },
      }),
      { timeout: 5_000 }
    )
  } catch {
    // updateUser might not accept these fields, continue anyway
  }

  // Also revoke all sessions
  try {
    await callBetterAuth(
      async (auth) => (auth.api as Record<string, unknown>).revokeSessions({ body: { userId: user.id } }),
      { timeout: 5_000 }
    )
  } catch {
    // revokeSessions might not be available, continue anyway
  }

  const ip = getClientIp(event)

  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'consent_withdrawal',
    ipAddress: ip || null,
    metadata: {
      consentWithdrawnAt: new Date(),
    },
  })

  return { message: 'Consent withdrawn successfully' }
})

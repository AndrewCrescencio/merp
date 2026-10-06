import { defineEventHandler, readBody } from 'h3'
import {
  createAuthEvent,
  getClientIp,
  sendUnauthorizedError,
  validateConsentWithdrawInput,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  validateConsentWithdrawInput(await readBody(event))
  const user = event.context.user as { id: string; email: string } | undefined

  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  await callBetterAuth(
    async (auth) => auth.api.updateUser({
      body: { isActive: false, consentWithdrawnAt: new Date() },
    }),
    { timeout: 5_000 }
  )

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

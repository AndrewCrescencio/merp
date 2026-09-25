import { defineEventHandler, readBody } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
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

  const result = await identityRepository.withdrawConsent(user.id)

  const ip = getClientIp(event)

  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'consent_withdrawal',
    ipAddress: ip || null,
    metadata: {
      consentWithdrawnAt: result.consentWithdrawnAt ?? null,
    },
  })

  return { message: 'Consent withdrawn successfully' }
})

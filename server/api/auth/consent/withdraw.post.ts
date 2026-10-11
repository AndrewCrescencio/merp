import { defineEventHandler, readBody } from 'h3'
import {
  createAuthEvent,
  getClientIp,
  sendUnauthorizedError,
  validateConsentWithdrawInput,
} from '~~/server/utils/shared'
import { withdrawConsent } from '~~/server/utils/auth/identity/queries'

export default defineEventHandler(async (event) => {
  validateConsentWithdrawInput(await readBody(event))
  const user = event.context.user as { id: string; email: string; name?: string | null } | undefined

  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  // FR-021: desativação imediata da conta + término de todas as sessões.
  // updateUser/revokeSessions exigiam sessão e eram engolidos pelo catch,
  // deixando a conta ativa e logável após a retirada.
  const updated = await withdrawConsent(user.id)

  const ip = getClientIp(event)

  await createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'consent_withdrawal',
    ipAddress: ip || null,
    metadata: {
      consentWithdrawnAt: updated.consentWithdrawnAt,
    },
  })

  return { message: 'Consent withdrawn successfully' }
})

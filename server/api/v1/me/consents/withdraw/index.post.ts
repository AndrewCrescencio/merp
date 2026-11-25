import {
  createAuthEvent,
  getClientIp,
  defineAuthHandler,
  validateConsentWithdrawInput,
} from '~~/server/utils/shared'
import { withdrawConsent } from '~~/server/utils/auth/identity/queries'

export default defineAuthHandler(
  { body: validateConsentWithdrawInput },
  async ({ event, user }) => {
    // desativação imediata da conta + término de todas as sessões.
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
  },
)

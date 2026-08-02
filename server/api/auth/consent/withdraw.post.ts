import { defineEventHandler, getRequestIP, createError } from 'h3'
import { authRepository } from '~~/server/utils/auth/repository'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined

  if (!user) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const result = await authRepository.withdrawConsent(user.id)

  const ip = getRequestIP(event, { xForwardedFor: true })

  // FR-021: consent_withdrawal — desativação imediata já feita pelo repositório;
  // a fila de deleção/anonymização fica fora deste escopo.
  await authRepository.createAuthEvent({
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

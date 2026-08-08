import { defineEventHandler, getRequestIP, createError } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import { createAuthEvent } from '~~/server/utils/shared/audit'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string; email: string } | undefined

  if (!user) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const result = await identityRepository.withdrawConsent(user.id)

  const ip = getRequestIP(event, { xForwardedFor: true })

  // FR-021: consent_withdrawal — desativação imediata já feita pelo repositório;
  // a fila de deleção/anonymização fica fora deste escopo.
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

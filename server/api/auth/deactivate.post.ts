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

  await authRepository.deactivateUser(user.id)

  const ip = getRequestIP(event, { xForwardedFor: true })
  const session = event.context.session as
    | { id: string; activeCompanyId?: string | null }
    | undefined

  // FR-023: session_invalidated — deactivateUser encerrou todas as sessões do
  // usuário; sessionId da sessão atual é registrado quando disponível.
  await authRepository.createAuthEvent({
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

  await authRepository.createAuthEvent({
    userId: user.id,
    email: user.email,
    eventType: 'deactivation',
    ipAddress: ip || null,
  })

  return { message: 'Account deactivated successfully' }
})

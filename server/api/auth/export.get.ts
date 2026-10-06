import { defineEventHandler } from 'h3'
import { db } from '~~/server/db'
import { authEvent } from '~~/server/schema'
import { callBetterAuth } from '~~/server/utils/auth/identity/client'
import { membershipRepository } from '~~/server/utils/auth/company/membership'

export default defineEventHandler(async (event) => {
  const user = event.context.user as
    | {
        id: string
        email: string
        name: string | null
      }
    | undefined

  if (!user) {
    sendUnauthorizedError('Authentication required.')
  }

  const [sessionResult, companies, authEvents] = await Promise.all([
    callBetterAuth(
      async (auth) => auth.api.getSession({ headers: event.headers }),
      { timeout: 5_000 }
    ),
    membershipRepository.findUserCompanies(user.id),
    await db.select().from(authEvent).where(eq(authEvent.userId, user.id)).orderBy(authEvent.createdAt),
  ])

  const session = sessionResult?.response?.session?.user || sessionResult?.response?.user
  const fullUser = session || { id: user.id, email: user.email, name: user.name }

  return {
    profile: {
      id: fullUser.id || user.id,
      email: user.email,
      name: fullUser.name || user.name,
      createdAt: fullUser.createdAt || undefined,
    },
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      cnpj: c.cnpj,
      razaoSocial: c.razaoSocial,
      role: c.role,
    })),
    sessions: [],
    authEvents: authEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      ipAddress: e.ipAddress,
      createdAt: e.createdAt,
    })),
  }
})
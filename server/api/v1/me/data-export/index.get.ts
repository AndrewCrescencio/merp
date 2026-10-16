import { defineEventHandler } from 'h3'
import { withTenant } from '~~/server/utils/db/tenant-context'
import { authEvent } from '~~/server/utils/schema'
import { eq } from 'drizzle-orm'
import { callBetterAuth } from '~~/server/utils/auth/identity/client'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
import { sendUnauthorizedError } from '~~/server/utils/shared'

interface BetterAuthSession {
  session: {
    id: string
    userId: string
    expiresAt: Date
    token: string
    createdAt: Date
    updatedAt: Date
    ipAddress?: string | null
    userAgent?: string | null
  }
  user: {
    id: string
    email: string
    name: string | null
    image?: string | null
    emailVerified: boolean
    createdAt: Date
    updatedAt: Date
  }
}

interface BetterAuthGetSessionResponse {
  session: BetterAuthSession['session'] | null
  user: BetterAuthSession['user'] | null
}

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
    callBetterAuth(async (auth) => auth.api.getSession({ headers: event.headers }), {
      timeout: 5_000,
    }),
    membershipRepository.findUserCompanies(user!.id),
    withTenant(null, null, user!.id, (tx) =>
      tx
        .select()
        .from(authEvent)
        .where(eq(authEvent.userId, user!.id))
        .orderBy(authEvent.createdAt),
    ),
  ])

  const sessionData = (sessionResult as unknown as { response?: BetterAuthGetSessionResponse })
    ?.response
  const sessionUser = sessionData?.user
  const fullUser: { id: string; email: string; name: string | null; createdAt?: Date } =
    sessionUser || { id: user!.id, email: user!.email, name: user!.name }

  return {
    profile: {
      id: fullUser.id || user!.id,
      email: user!.email,
      name: fullUser.name || user!.name,
      createdAt: fullUser.createdAt,
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

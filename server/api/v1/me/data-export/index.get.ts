import { callBetterAuth } from '~~/server/utils/auth/identity/client'
import { listUserAuthEvents } from '~~/server/utils/auth/identity/queries'
import { membershipRepository } from '~~/server/utils/companies/company/membership'
import { defineAuthHandler } from '~~/server/utils/shared'
import { checkExportRateLimit } from '~~/server/utils/shared/security'

export default defineAuthHandler({}, async ({ event, user }) => {
  await checkExportRateLimit(event, user.id)

  const [sessionData, companies, authEvents] = await Promise.all([
    callBetterAuth(async (auth) => auth.api.getSession({ headers: event.headers }), {
      timeout: 5_000,
    }),
    membershipRepository.findUserCompanies(user.id),
    listUserAuthEvents(user.id),
  ])

  const sessionUser = sessionData?.user

  return {
    profile: {
      id: sessionUser?.id || user.id,
      email: user.email,
      name: sessionUser?.name || user.name,
      createdAt: sessionUser?.createdAt,
    },
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
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

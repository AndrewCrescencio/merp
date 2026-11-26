import { Buffer } from 'node:buffer'
import { getQuery } from 'h3'
import {
  MAX_AUTH_EVENTS_PER_PAGE,
  authEventCursorSchema,
  dataExportQuerySchema,
} from '#shared/contracts/data-export'
import { callBetterAuth } from '~~/server/utils/auth/identity/client'
import { listUserAuthEvents, listUserAuthEventsPage } from '~~/server/utils/auth/identity/queries'
import { membershipRepository } from '~~/server/utils/companies/company/membership'
import { defineAuthHandler, sendValidationError } from '~~/server/utils/shared'
import { checkExportRateLimit } from '~~/server/utils/shared/security'

function parseCursor(cursor: string) {
  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    sendValidationError('Invalid auth event cursor')
  }
  const parsed = authEventCursorSchema.safeParse(payload)
  if (!parsed.success) sendValidationError('Invalid auth event cursor')
  return parsed.data
}

export default defineAuthHandler({}, async ({ event, user }) => {
  await checkExportRateLimit(event, user.id)

  const parsed = dataExportQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) sendValidationError('Invalid auth event pagination options')

  const { limit, cursor } = parsed.data
  const page = limit !== undefined || cursor !== undefined
  const after = cursor === undefined ? undefined : parseCursor(cursor)

  const [sessionData, companies, authEvents] = await Promise.all([
    callBetterAuth(async (auth) => auth.api.getSession({ headers: event.headers }), {
      timeout: 5_000,
    }),
    membershipRepository.findUserCompanies(user.id),
    page
      ? listUserAuthEventsPage(user.id, limit ?? MAX_AUTH_EVENTS_PER_PAGE, after)
      : listUserAuthEvents(user.id).then((events) => ({ events, next: null })),
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
    authEvents: authEvents.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      ipAddress: e.ipAddress,
      createdAt: e.createdAt,
    })),
    ...(page && {
      authEventsPagination: {
        nextCursor: authEvents.next
          ? Buffer.from(JSON.stringify(authEvents.next)).toString('base64url')
          : null,
      },
    }),
  }
})

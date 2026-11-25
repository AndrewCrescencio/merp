import { defineAuthHandler } from '~~/server/utils/shared'
import { deactivateUser } from '~~/server/utils/auth/identity/queries'

export default defineAuthHandler(
  {
    audit: (_, { session, user }) => [
      {
        eventType: 'session_invalidated',
        metadata: { sessionId: session.id ?? null, userId: user.id },
      },
      'deactivation',
    ],
  },
  async ({ user }) => {
    await deactivateUser(user.id)
    return { message: 'Account deactivated successfully' }
  },
)

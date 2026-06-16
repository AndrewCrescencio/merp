import { defineEventHandler } from 'h3'
import { auth } from '#shared/auth'
import { sendUnauthorizedError } from '~~/server/utils/auth/helpers'

export default defineEventHandler(async (event) => {
  const session = event.context.session as { id: string } | undefined

  if (!session) {
    sendUnauthorizedError('No active session.')
  }

  await auth.api.signOut({
    headers: event.headers,
  })

  return { message: 'Logged out successfully' }
})

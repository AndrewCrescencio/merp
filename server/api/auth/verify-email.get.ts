import { defineEventHandler, getQuery } from 'h3'
import { verifyEmailBA } from '~~/server/utils/auth/identity/queries'
import { checkIpRateLimit, validateVerifyEmailInput } from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const { token } = validateVerifyEmailInput(getQuery(event))

  await verifyEmailBA(token)

  return { status: true }
})

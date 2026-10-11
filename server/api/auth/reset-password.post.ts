import { defineEventHandler, getQuery, readBody } from 'h3'
import { resetPasswordBA } from '~~/server/utils/auth/identity/queries'
import { checkIpRateLimit, validateResetPasswordInput } from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const body = await readBody<{ token?: string; newPassword?: string }>(event)
  const { token, newPassword } = validateResetPasswordInput(body, getQuery(event))

  await resetPasswordBA(token, newPassword)

  return { status: true }
})

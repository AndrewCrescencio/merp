import { defineEventHandler, readBody } from 'h3'
import { sendVerificationEmailBA } from '~~/server/utils/auth/identity/queries'
import {
  checkEmailRateLimit,
  checkIpRateLimit,
  validateSendVerificationEmailInput,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const body = await readBody<{ email?: string }>(event)
  const { email } = validateSendVerificationEmailInput(body)

  await checkEmailRateLimit(event, email)

  await sendVerificationEmailBA(email)

  return { status: true }
})

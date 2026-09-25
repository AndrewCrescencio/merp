import { defineEventHandler, readBody } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
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

  await identityRepository.sendVerificationEmail(email)

  return { status: true }
})

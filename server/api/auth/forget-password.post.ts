import { defineEventHandler, readBody } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import {
  checkEmailRateLimit,
  checkIpRateLimit,
  validateForgetPasswordInput,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const body = await readBody<{ email?: string }>(event)
  const { email } = validateForgetPasswordInput(body)

  await checkEmailRateLimit(event, email)

  await identityRepository.requestPasswordReset(email)

  return {
    status: true,
    message: 'If this email exists in our system, check your email for the reset link',
  }
})

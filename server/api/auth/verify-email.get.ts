import { defineEventHandler, getQuery } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import { checkIpRateLimit, validateVerifyEmailInput } from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const { token } = validateVerifyEmailInput(getQuery(event))

  await identityRepository.verifyEmail(token)

  return { status: true }
})

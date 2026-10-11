import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { registerUser, generateUserId } from '~~/server/utils/auth/identity/queries'
import {
  checkEmailRateLimit,
  checkIpRateLimit,
  createAuthEvent,
  getClientIp,
  validateRegisterInput,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const body = await readBody<{
    email?: string
    password?: string
    name?: string
    consentTermsVersion?: string
  }>(event)

  const { email, password, name, consentTermsVersion } = await validateRegisterInput(body)

  await checkEmailRateLimit(event, email)

  const user = await registerUser({
    email,
    password,
    name,
    consentTermsVersion,
  })

  if (user) {
    const ip = getClientIp(event)
    await createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'registration',
      ipAddress: ip || null,
    })
  }

  setResponseStatus(event, 201)
  return {
    id: user?.id ?? generateUserId(),
    email: user?.email ?? email,
    name: user?.name ?? name,
    createdAt: user?.createdAt ?? new Date(),
  }
})

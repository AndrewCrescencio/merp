import { defineEventHandler, getQuery, readBody } from 'h3'
import { resetPasswordBA } from '~~/server/utils/auth/identity/queries'
import {
  checkIpRateLimit,
  checkPasswordBreach,
  isWeakPassword,
  MAX_PASSWORD_LENGTH,
  sendValidationError,
  validateResetPasswordInput,
} from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const body = await readBody<{ token?: string; newPassword?: string }>(event)
  const { token, newPassword } = validateResetPasswordInput(body, getQuery(event))

  if (isWeakPassword(newPassword)) {
    sendValidationError('Password is too common. Choose a stronger password.')
  }

  const breach = await checkPasswordBreach(newPassword)
  if (breach.breached) {
    sendValidationError(
      'This password has appeared in data breaches. Please choose a different password.',
    )
  }

  await resetPasswordBA(token, newPassword)

  return { status: true }
})

import { defineEventHandler, readBody } from 'h3'
import { resetPasswordBA } from '~~/server/utils/auth/identity/queries'
import { checkIpRateLimit, validateResetPasswordInput } from '~~/server/utils/shared'

// R6: o token vem só no body (o link de e-mail aponta para a página Nuxt, que
// faz POST com o token no body) — nunca em path/query da API.
export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const { token, newPassword } = validateResetPasswordInput(await readBody(event))

  await resetPasswordBA(token, newPassword)

  return { status: true }
})

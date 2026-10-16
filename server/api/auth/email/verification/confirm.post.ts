import { defineEventHandler, readBody } from 'h3'
import { verifyEmailBA } from '~~/server/utils/auth/identity/queries'
import { checkIpRateLimit, validateVerifyEmailInput } from '~~/server/utils/shared'

// R6: o token vem só no body (a página Nuxt lê o token da URL do link de
// e-mail e faz POST com ele no body) — nunca em path/query da API.
export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const { token } = validateVerifyEmailInput(await readBody(event))

  await verifyEmailBA(token)

  return { status: true }
})

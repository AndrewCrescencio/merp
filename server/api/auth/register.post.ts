import { defineEventHandler, readBody, setHeader, setResponseStatus } from 'h3'
import { acquisitionChannelSchema } from '~~/shared/contracts/acquisition'
import { recordProductMilestone } from '~~/server/utils/insights/product'
import { registerUser, generateUserId } from '~~/server/utils/auth/identity/queries'
import {
  checkEmailRateLimit,
  checkIpRateLimit,
  createAuthEvent,
  enforceMinimumTime,
  getClientIp,
  validateRegisterInput,
} from '~~/server/utils/shared'

// duplicata devolve um perfil forjado (201), então o corpo da resposta
// não vaza nada. Mas o caminho livre faz hash de senha, grava token e ENVIA o
// email de verificação, enquanto o de duplicata só faz um lookup e retorna em
// registerUser antes do signUpEmail — sem o piso o relógio denuncia qual dos
// dois aconteceu.
// O piso precisa ser maior que o envio: sign-up.mjs:245 AGUARDA o callback e o
// melhor auth não tem backgroundTasks.handler, então o fluxo novo espera os
// RESEND_TIMEOUT_MS do email.ts (o de duplicata não envia nada). Pior caso do
// caminho livre = lookup + scrypt + insert + token + envio 450 + consentimento
// + createAuthEvent ≈ 600ms; 700ms cobre tudo com folga para round-trips.
const MINIMUM_MS = 700

export default defineEventHandler(async (event) => {
  const start = Date.now()

  await checkIpRateLimit(event)

  const body = await readBody<Record<string, unknown>>(event)

  const { email, password, name, consentTermsVersion } = await validateRegisterInput(body)

  await checkEmailRateLimit(event, email)

  const user = await registerUser({ email, password, name, consentTermsVersion })

  if (user) {
    const ip = getClientIp(event)
    await createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'registration',
      ipAddress: ip || null,
    })
    const channel = acquisitionChannelSchema.safeParse(body?.acquisitionChannel)
    recordProductMilestone(event, 'signup_completed', channel.data)
  }

  await enforceMinimumTime(start, MINIMUM_MS)

  setResponseStatus(event, 201)
  // o usuário criado é o recurso /api/v1/me do próprio requestante.
  setHeader(event, 'Location', '/api/v1/me')
  return {
    id: user?.id ?? generateUserId(),
    email: user?.email ?? email,
    name: user?.name ?? name,
    createdAt: user?.createdAt ?? new Date(),
  }
})

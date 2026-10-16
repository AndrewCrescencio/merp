import { defineEventHandler, readBody } from 'h3'
import { requestPasswordResetBA } from '~~/server/utils/auth/identity/queries'
import {
  checkEmailRateLimit,
  checkIpRateLimit,
  enforceMinimumTime,
  validateForgetPasswordInput,
} from '~~/server/utils/shared'

// AUD-04: piso de tempo. O corpo da resposta é idêntico para email existente e
// inexistente, mas o caminho com envio chama a API do Resend (limitado a 450ms
// em sendResendEmail) e grava o token no banco — sem o piso, o relógio denuncia
// a existência da conta (IP 20/min cai com IPs distribuídos; o limite por email
// não ajuda, pois cada sondeo usa um email diferente).
// Pior caso do caminho com envio = rate limits + findUserByEmail +
// createVerificationValue + Resend ≈ 480ms; 650ms deixa ~170ms de folga para
// round-trips de banco.
const MINIMUM_MS = 650

export default defineEventHandler(async (event) => {
  const start = Date.now()

  await checkIpRateLimit(event)

  const body = await readBody<{ email?: string }>(event)
  const { email } = validateForgetPasswordInput(body)

  await checkEmailRateLimit(event, email)

  await requestPasswordResetBA(email)

  await enforceMinimumTime(start, MINIMUM_MS)

  return {
    status: true,
    message: 'If this email exists in our system, check your email for the reset link',
  }
})

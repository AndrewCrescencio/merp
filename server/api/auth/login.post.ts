import { defineEventHandler, readBody, appendResponseHeaders } from 'h3'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import {
  checkAccountLockout,
  checkEmailRateLimit,
  checkIpRateLimit,
  normalizeEmail,
  recordFailedAttempt,
  resetFailedAttempts,
} from '~~/server/utils/shared/security'
import { sendUnauthorizedError, sendValidationError } from '~~/server/utils/shared/errors'
import { createAuthEvent } from '~~/server/utils/shared/audit'
import { sendDeactivationNotice } from '~~/server/utils/shared/email'
import { getClientIp } from '~~/server/utils/shared/ip'

// LOCKOUT_EXEMPT_ERROR_CODES marca os codes que NÃO contam para lockout
// (conta desativada não bloqueia o dono por 30min). Nada aqui é repassado
// ao cliente: toda falha de login retorna o mesmo 401 genérico de credenciais
// inválidas para impedir enumeração de contas (AUD-06); o motivo específico
// fica apenas na auditoria interna.
const LOCKOUT_EXEMPT_ERROR_CODES = new Set(['account_deactivated'])

function getLoginErrorReason(error: any): string {
  if (error?.statusCode !== 401) return 'unknown'
  if (typeof error?.message === 'string') {
    try {
      const parsed = JSON.parse(error.message)
      if (typeof parsed?.error === 'string') {
        return LOCKOUT_EXEMPT_ERROR_CODES.has(parsed.error) ? parsed.error : 'invalid_credentials'
      }
    } catch {
      // message não é JSON — 401 genérico
    }
  }
  return 'invalid_credentials'
}

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const body = await readBody<{ email?: string; password?: string; rememberMe?: boolean }>(event)

  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email || !body?.password) {
    sendValidationError('Email and password are required')
  }

  await checkEmailRateLimit(event, email)

  try {
    await checkAccountLockout(email)
  } catch (error) {
    // A conta está bloqueada, mas o cliente recebe o mesmo 401 genérico de
    // credenciais inválidas (anti-enumeração). O motivo fica na auditoria.
    if (getLoginErrorReason(error) === 'invalid_credentials') {
      const ip = getClientIp(event)
      await createAuthEvent({
        email,
        eventType: 'failed_login',
        ipAddress: ip,
        metadata: { reason: 'account_locked' },
      })
      sendUnauthorizedError('Invalid email or password')
    }
    throw error
  }

  try {
    const user = await identityRepository.signIn(
      {
        email,
        password: body.password,
        rememberMe: body.rememberMe === true,
      },
      event.headers,
    )

    await resetFailedAttempts(email)

    if (user.setCookie.length > 0) {
      appendResponseHeaders(event, { 'set-cookie': user.setCookie })
    }

    const ip = getClientIp(event)
    await createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'login',
      ipAddress: ip,
    })

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    }
  } catch (error: any) {
    const ip = getClientIp(event)
    const reason = getLoginErrorReason(error)

    await createAuthEvent({
      email,
      eventType: 'failed_login',
      ipAddress: ip,
      metadata: { reason },
    })

    // Lockout conta apenas tentativas de credencial inválida: falhas de
    // infraestrutura (503/500) ou conta desativada não devem bloquear o
    // usuário por 30 min.
    if (reason === 'invalid_credentials') {
      await recordFailedAttempt(email)
    }

    if (reason === 'account_deactivated') {
      // Fire-and-forget: não aguardamos o envio para preservar o timing
      // equalizado do AUD-07 (um await no Resend adicionaria ~100-500ms ao
      // caminho desativado, reintroduzindo o oráculo de timing). Premissa: o
      // processo Node persiste vivo o suficiente para concluir o fetch
      // pendente após a resposta ser enviada — NÃO é seguro em presets
      // serverless/edge.
      void sendDeactivationNotice(email)
      sendUnauthorizedError('Invalid email or password')
    }

    if (error?.statusCode === 401) {
      sendUnauthorizedError('Invalid email or password')
    }

    throw error
  }
})

import { defineEventHandler, readBody, appendResponseHeaders } from 'h3'
import { logger } from '#shared/logger'
import { identityRepository } from '~~/server/utils/auth/identity/repository'
import {
  checkAccountLockout,
  checkEmailRateLimit,
  checkIpRateLimit,
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  normalizeEmail,
  recordFailedAttempt,
  resetFailedAttempts,
} from '~~/server/utils/shared/security'
import {
  sendAuthError,
  sendUnauthorizedError,
  sendValidationError,
} from '~~/server/utils/shared/errors'
import { createAuthEvent } from '~~/server/utils/shared/audit'
import { sendDeactivationNotice } from '~~/server/utils/shared/email'
import { getClientIp } from '~~/server/utils/shared/ip'

// LOCKOUT_EXEMPT_ERROR_CODES marca os codes que NÃO contam para lockout
// (conta desativada não bloqueia o dono por 30min; email não-verificado tem
// a senha CORRETA comprovada — bloquear seria punir a vítima). Nada aqui é
// repassado como 401 genérico: o motivo específico fica apenas na auditoria
// interna, exceto email_not_verified (403 explícito — ver abaixo).
const LOCKOUT_EXEMPT_ERROR_CODES = new Set(['account_deactivated', 'email_not_verified'])

function getLoginErrorReason(error: any): string {
  const status = error?.statusCode ?? error?.status
  if (status !== 401 && status !== 403) return 'unknown'
  if (typeof error?.message === 'string') {
    try {
      const parsed = JSON.parse(error.message)
      if (typeof parsed?.error === 'string') {
        return LOCKOUT_EXEMPT_ERROR_CODES.has(parsed.error) ? parsed.error : 'invalid_credentials'
      }
    } catch {
      // message não é JSON — erro genérico
    }
  }
  return 'invalid_credentials'
}

export default defineEventHandler(async (event) => {
  await checkIpRateLimit(event)

  const body = await readBody<{ email?: string; password?: string; rememberMe?: boolean }>(event)

  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  // AUD-23: typeof password entra na validação — senha numérica passava por
  // !body?.password e derrubava no `.length`/scrypt com TypeError → 500.
  if (!email || typeof body?.password !== 'string' || !body.password) {
    sendValidationError('Email and password are required')
  }

  // AUD-14: tetos de tamanho ANTES do checkEmailRateLimit — email gigante não
  // pode virar chave `rate:`/`lockout:` (PK text; índice btree quebra → 503)
  // nem pagar scrypt em senha de megabytes. Resposta 401 genérico idêntica a
  // credenciais inválidas: nenhuma conta legítima passa dos tetos (register
  // impõe os mesmos) — zero oráculo de enumeração, timing uniforme.
  if (email.length > MAX_EMAIL_LENGTH || body.password.length > MAX_PASSWORD_LENGTH) {
    sendUnauthorizedError('Invalid email or password')
  }

  // AUD-02: IP resolvido uma vez no início — o lockout é chaveado por
  // (email + IP) para que 10 falhas de um IP não bloqueiem a vítima.
  let ip: string | null = null
  try {
    ip = getClientIp(event) ?? null
  } catch {
    // Sem socket (ex.: eventos de teste) — apenas a camada global por email.
  }

  await checkEmailRateLimit(event, email)

  try {
    await checkAccountLockout(email, ip)
  } catch (error) {
    // A conta está bloqueada, mas o cliente recebe o mesmo 401 genérico de
    // credenciais inválidas (anti-enumeração). O motivo fica na auditoria.
    if (getLoginErrorReason(error) === 'invalid_credentials') {
      // AUD-11: getClientIp fora do try/catch mascararia o erro de lockout com
      // um 500 espúrio (sem socket, ex.: eventos de teste) — auditoria sem IP.
      let auditIp: string | null = null
      try {
        auditIp = getClientIp(event)
      } catch {
        // Sem socket — auditoria sem IP.
      }
      await createAuthEvent({
        email,
        eventType: 'failed_login',
        ipAddress: auditIp,
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

    // AUD-14: reset de lockout não pode derrubar um login de sucesso — se a
    // limpeza falhar (DB hiccup), a sessão já foi criada pelo better-auth;
    // virar 503 aqui devolveria erro com sessão órfã + auditoria failed_login
    // reason 'unknown' enganosa. Loga e entrega o login; contadores stale
    // expiram em 30min/24h (purge-security-state).
    try {
      await resetFailedAttempts(email, ip)
    } catch (error) {
      logger.warn('Failed to reset failed attempts after successful login', {
        email,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    if (user.setCookie.length > 0) {
      appendResponseHeaders(event, { 'set-cookie': user.setCookie })
    }

    // AUD-13: fire-and-forget (padrão FR-023) — o Set-Cookie de sessão já foi
    // anexado; se a auditoria falhasse com await, o cliente receberia 503 com
    // sessão válida criada (estado inconsistente + sessões órfãs em retries).
    void createAuthEvent({
      userId: user.id,
      email: user.email,
      eventType: 'login',
      ipAddress: ip,
    }).catch((error: unknown) => {
      logger.warn('Failed to emit login auth event', {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      })
    })

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    }
  } catch (error: any) {
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
      await recordFailedAttempt(email, ip)
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

    if (reason === 'email_not_verified') {
      // AUD-04: 403 explícito — exceção deliberada ao 401 genérico. Só é
      // alcançado com a senha CORRETA (o better-auth verifica o scrypt antes
      // do check de email_verified), então não vaza existência de conta para
      // quem não tem as credenciais. O link de verificação é enviado no
      // mesmo fluxo (sendOnSignIn). Não conta para lockout.
      sendAuthError(
        403,
        'email_not_verified',
        'Please verify your email address before logging in.',
      )
    }

    if (error?.statusCode === 401) {
      sendUnauthorizedError('Invalid email or password')
    }

    throw error
  }
})

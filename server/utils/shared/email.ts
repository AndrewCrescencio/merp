import { logger } from '#shared/logger'

const RESEND_API_URL = 'https://api.resend.com/emails'
const RESEND_TIMEOUT_MS = 5_000

// Envio transacional genérico (Resend): best-effort, nunca lança — email é
// canal de feedback do dono, não caminho crítico de auth. A ausência de
// RESEND_API_KEY/RESEND_FROM pula o envio com warn; erros do provider são
// logados. ponytail: sem fila/retry; perda do email em crash de processo é
// aceita e logada.
export async function sendTransactionalEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!apiKey || !from) {
    logger.warn('RESEND_API_KEY/RESEND_FROM not configured — skipping email', { to, subject })
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS)
  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
      signal: controller.signal,
    })
    if (!response.ok) {
      logger.error('Resend rejected email', {
        to,
        subject,
        status: response.status,
        body: await response.text().catch(() => ''),
      })
    }
  } catch (error) {
    logger.error('Failed to send email', { to, subject, error: String(error) })
  } finally {
    clearTimeout(timeout)
  }
}

export async function sendDeactivationNotice(email: string): Promise<void> {
  await sendTransactionalEmail(
    email,
    'Your account has been deactivated',
    '<p>Your account has been deactivated. If you believe this is a mistake, please contact support.</p>',
  )
}

// AUD-04: o better-auth já gera os links com o basePath do app no context
// baseURL (withPath inclui /api/auth) — `${baseURL}/api/auth/verify-email`
// e `${baseURL}/api/auth/reset-password/<token>`, exatamente as rotas do
// app. Apenas o callbackURL padrão (%2F) é removido do link de verificação
// para o email ficar limpo; o link de reset mantém o callbackURL (usado no
// redirecionamento do clique).
export function appVerificationLink(url: string): string {
  return url.split('&callbackURL=')[0]
}

export async function sendVerificationEmailLink(to: string, link: string): Promise<void> {
  await sendTransactionalEmail(
    to,
    'Verify your email address',
    `<p>Welcome! Please verify your email address to activate your account:</p><p><a href="${link}">${link}</a></p>`,
  )
}

export async function sendPasswordResetLink(to: string, link: string): Promise<void> {
  await sendTransactionalEmail(
    to,
    'Reset your password',
    `<p>We received a request to reset your password. Click the link to continue:</p><p><a href="${link}">${link}</a></p>`,
  )
}

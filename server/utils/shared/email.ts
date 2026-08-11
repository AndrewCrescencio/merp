import { logger } from '#shared/logger'

const RESEND_API_URL = 'https://api.resend.com/emails'
const RESEND_TIMEOUT_MS = 5_000

// Envio de aviso de conta desativada (AUD-06): best-effort, nunca lança —
// o email é canal de feedback do dono, não caminho crítico do login.
// ponytail: sem fila/retry; perda do email em crash de processo é aceita
// e logada.
export async function sendDeactivationNotice(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!apiKey || !from) {
    logger.warn('RESEND_API_KEY/RESEND_FROM not configured — skipping deactivation notice', {
      email,
    })
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
      body: JSON.stringify({
        from,
        to: email,
        subject: 'Your account has been deactivated',
        html: '<p>Your account has been deactivated. If you believe this is a mistake, please contact support.</p>',
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      logger.error('Resend rejected deactivation notice', {
        email,
        status: response.status,
        body: await response.text().catch(() => ''),
      })
    }
  } catch (error) {
    logger.error('Failed to send deactivation notice', { email, error: String(error) })
  } finally {
    clearTimeout(timeout)
  }
}

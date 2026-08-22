import { logger } from '#shared/logger'
import { db } from '~~/server/utils/db'
import { emailQueue } from '~~/server/utils/schema'
import { eq, and, lt } from 'drizzle-orm'

const RESEND_API_URL = 'https://api.resend.com/emails'
const RESEND_TIMEOUT_MS = 5_000
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 60_000

interface QueueEmailOptions {
  to: string
  subject: string
  html: string
  maxAttempts?: number
}

export async function queueEmail(options: QueueEmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!apiKey || !from) {
    logger.warn('RESEND_API_KEY/RESEND_FROM not configured — email not queued', {
      to: options.to,
      subject: options.subject,
    })
    return
  }

  await db.insert(emailQueue).values({
    to: options.to,
    subject: options.subject,
    html: options.html,
    maxAttempts: options.maxAttempts ?? MAX_ATTEMPTS,
    status: 'pending',
    scheduledAt: new Date(),
  })
}

export async function sendDeactivationNotice(email: string): Promise<void> {
  await queueEmail({
    to: email,
    subject: 'Your account has been deactivated',
    html: '<p>Your account has been deactivated. If you believe this is a mistake, please contact support.</p>',
  })
}

// AUD-04: o better-auth já gera os links com o basePath do app no context
// baseURL (withPath inclui /api/auth) — `${baseURL}/api/auth/verify-email`
// e `${baseURL}/api/auth/reset-password/<token>`, exatamente as rotas do
// app. Apenas o callbackURL padrão (%2F) é removido do link de verificação
// para o email ficar limpo; o link de reset mantém o callbackURL (usado no
// redirecionamento do clique).
export function appVerificationLink(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete('callbackURL')
    return parsed.toString()
  } catch {
    // Fallback to original behavior if URL parsing fails
    return url.split('&callbackURL=')[0]
  }
}

export async function sendVerificationEmailLink(to: string, link: string): Promise<void> {
  await queueEmail({
    to,
    subject: 'Verify your email address',
    html: `<p>Welcome! Please verify your email address to activate your account:</p><p><a href="${link}">${link}</a></p>`,
  })
}

export async function sendPasswordResetLink(to: string, link: string): Promise<void> {
  await queueEmail({
    to,
    subject: 'Reset your password',
    html: `<p>We received a request to reset your password. Click the link to continue:</p><p><a href="${link}">${link}</a></p>`,
  })
}

async function sendEmailDirect(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!apiKey || !from) {
    return false
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
      return false
    }
    return true
  } catch (error) {
    logger.error('Failed to send email', { to, subject, error: String(error) })
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export async function processEmailQueue(batchSize = 10): Promise<void> {
  const now = new Date()

  const pending = await db
    .select()
    .from(emailQueue)
    .where(and(eq(emailQueue.status, 'pending'), lt(emailQueue.scheduledAt, now)))
    .limit(batchSize)

  for (const email of pending) {
    const attempts = email.attempts + 1
    const success = await sendEmailDirect(email.to, email.subject, email.html)

    if (success) {
      await db
        .update(emailQueue)
        .set({
          status: 'sent',
          sentAt: new Date(),
          attempts,
          updatedAt: new Date(),
        })
        .where(eq(emailQueue.id, email.id))
    } else if (attempts >= email.maxAttempts) {
      await db
        .update(emailQueue)
        .set({
          status: 'failed',
          attempts,
          lastError: 'Max attempts reached',
          updatedAt: new Date(),
        })
        .where(eq(emailQueue.id, email.id))
    } else {
      await db
        .update(emailQueue)
        .set({
          attempts,
          scheduledAt: new Date(Date.now() + RETRY_DELAY_MS * attempts),
          lastError: 'Send failed, will retry',
          updatedAt: new Date(),
        })
        .where(eq(emailQueue.id, email.id))
    }
  }
}

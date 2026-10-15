import { logger } from '#shared/logger'

export function appVerificationLink(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete('callbackURL')
    return parsed.toString()
  } catch {
    return url.split('&callbackURL=')[0] ?? url
  }
}

const RESEND_API_URL = 'https://api.resend.com/emails'

// AUD-04: o better-auth iguala o tempo de resposta com MINIMUM_MS=500 no fluxo
// de verificação e re-lança erro do callback depois do padding — um envio acima
// de 500ms (timing) ou uma exceção (status) viraria oráculo de enumeração de
// contas. 450ms deixa ~40ms de folga para o token e o lookup antes do piso.
// Subir este valor exige subir também os pisos dos handlers que AGUARDAM o
// envio: register.post.ts (700ms) e forget-password.post.ts (650ms).
const RESEND_TIMEOUT_MS = 450

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46">${escapeHtml(text)}</p>`
}

function button(label: string, url: string): string {
  return `<p style="margin:0 0 16px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px">${escapeHtml(label)}</a></p>
    <p style="margin:0 0 16px;font-size:13px;color:#71717a;word-break:break-all">${escapeHtml(url)}</p>`
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
      <h1 style="margin:0 0 16px;font-size:20px;color:#18181b">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa">Se você não solicitou este email, ignore esta mensagem.</p>
    </div>
  </body>
</html>`
}

/**
 * Envia um email transacional via Resend. Nunca lança: os callbacks que a
 * chamam são awaitados pelo better-auth dentro de fluxos anti-enumeração
 * (AUD-04), onde uma exceção exporia a existência da conta pelo status.
 * Sem RESEND_API_KEY/RESEND_FROM o envio é pulado com warning (login afetado
 * só na verificação de email — conta não-verificada fica bloqueada em 403).
 */
async function sendResendEmail(input: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!apiKey || !from) {
    logger.warn('Email skipped: RESEND_API_KEY/RESEND_FROM ausente', {
      to: input.to,
      subject: input.subject,
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
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      logger.error('Resend rejeitou o email', {
        status: response.status,
        to: input.to,
        subject: input.subject,
      })
    }
  } catch (error) {
    logger.error('Falha no envio de email', {
      to: input.to,
      subject: input.subject,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function sendVerificationNotice(email: string, url: string): Promise<void> {
  await sendResendEmail({
    to: email,
    subject: 'Confirme seu email — Merp',
    html: layout(
      'Confirme seu email',
      paragraph(
        'Olá! Recebemos um pedido para confirmar este endereço de email. Para ativar sua conta, clique no botão abaixo. O link expira em 1 hora.',
      ) + button('Confirmar email', appVerificationLink(url)),
    ),
  })
}

// O piso de tempo do /forget-password (650ms, em forget-password.post.ts)
// cobre o atraso do envio: lá o caminho com e sem email respondem igual, e sem
// o piso o Resend aqui denunciaria a existência da conta pelo relógio.
export async function sendPasswordResetNotice(email: string, url: string): Promise<void> {
  await sendResendEmail({
    to: email,
    subject: 'Redefinir sua senha — Merp',
    html: layout(
      'Redefinir sua senha',
      paragraph(
        'Olá! Recebemos um pedido para redefinir a senha desta conta. Clique no botão abaixo para escolher uma nova senha. O link expira em 1 hora.',
      ) + button('Redefinir senha', url),
    ),
  })
}

export async function sendDeactivationNotice(email: string): Promise<void> {
  await sendResendEmail({
    to: email,
    subject: 'Sua conta foi desativada — Merp',
    html: layout(
      'Sua conta foi desativada',
      paragraph(
        'Sua conta Merp foi desativada e você não poderá mais fazer login. Se você não reconhece esta ação, fale com o administrador da sua organização.',
      ),
    ),
  })
}

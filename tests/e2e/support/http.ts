import { SignJWT } from 'jose'
import postgres from 'postgres'
import { TEST_APP_URL, TEST_OWNER_URL } from '../../support/test-urls'

/**
 * Envs do servidor Nitro construído por @nuxt/test-utils: o processo do
 * servidor herda o process.env do worker do vitest — e nem o worker nem o
 * `node .output/server/index.mjs` carregam `.env`. Este módulo garante o
 * mínimo para o boot real: banco da role merp_app (RLS ON) e os segredos que
 * o cliente precisa MIRAR (o JWT de verificação mintado abaixo é assinado com
 * o MESMO segredo que o server usa para reconstruir/validar).
 */
function ensureE2eEnv(): void {
  process.env.APP_DATABASE_URL ||= TEST_APP_URL
  process.env.BETTER_AUTH_URL ||= 'http://localhost:3000'
  process.env.CORS_ORIGIN ||= 'http://localhost:3000'
  process.env.BETTER_AUTH_SECRET ||= 'e2e-secret-0123456789abcdef-0123456789'
  process.env.CSRF_SECRET ||= 'e2e-csrf-secret-0123456789abcdef-0123456789'
}

ensureE2eEnv()

export interface E2eResponse<T = Record<string, unknown>> {
  status: number
  headers: Headers
  body: T
}

export interface AuthInput {
  email: string
  password: string
  name: string
  consentTermsVersion?: string
}

/**
 * Token de verificação mintado de forma equivalente ao better-auth
 * (crypto/jwt.mjs: HS256, payload `{ email }`, iat + exp). O endpoint
 * /api/auth/email/verification/confirm roda a verificação REAL (valida a
 * assinatura, encontra o usuário e seta email_verified) — o que é simulado é
 * só a entrega por email (sem RESEND_API_KEY o token morre no logger; este é
 * o conteúdo que o link do email carregaria).
 */
async function mintEmailVerificationToken(email: string): Promise<string> {
  return await new SignJWT({ email: email.toLowerCase() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(new TextEncoder().encode(process.env.BETTER_AUTH_SECRET))
}

/**
 * Um "browser" headless: cada instância tem seu jar de cookies (sessão +
 * CSRF). Requisições mutantes carregam automaticamente o header
 * `x-csrf-token` com a parte crua do cookie `merp-csrf_token` — o mesmo
 * contrato do frontend. Não há fabricação de sessão: todo usuário passa pelo
 * fluxo real (register → confirm → login).
 */
export class E2eClient {
  readonly cookies = new Map<string, string>()
  private csrfToken: string | null = null

  constructor(readonly baseUrl: string) {}

  /** Fetch cru: injeta os cookies do jar e absorve os set-cookie da resposta. */
  async send(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    if (cookie) headers.set('cookie', cookie)

    const response = await fetch(`${this.baseUrl}${path}`, { redirect: 'manual', ...init, headers })
    this.absorb(response)
    return response
  }

  private absorb(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(';')
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      const lower = attrs.join(';').toLowerCase()

      // Set-Cookie de expiração (valor vazio, Max-Age=0 ou Expires=1970):
      // remove do jar em vez de envenenar o próximo request.
      if (!value || lower.includes('max-age=0') || lower.includes('expires=thu, 01 jan 1970')) {
        this.cookies.delete(name)
        continue
      }
      this.cookies.set(name, value)
      if (name === 'merp-csrf_token') this.csrfToken = value.split('.')[0]
    }
  }

  private csrfHeaders(): Record<string, string> {
    return this.csrfToken ? { 'x-csrf-token': this.csrfToken } : {}
  }

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: { csrf?: boolean } = {},
  ): Promise<E2eResponse<T>> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (method !== 'GET' && opts.csrf !== false) Object.assign(headers, this.csrfHeaders())

    const response = await this.send(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const text = await response.text()
    let parsed: unknown = null
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { raw: text } // resposta não-JSON (ex.: páginas de erro)
      }
    }
    return { status: response.status, headers: response.headers, body: parsed as T }
  }

  get<T = Record<string, unknown>>(path: string): Promise<E2eResponse<T>> {
    return this.call('GET', path)
  }

  post<T = Record<string, unknown>>(
    path: string,
    body?: unknown,
    opts: { csrf?: boolean } = {},
  ): Promise<E2eResponse<T>> {
    return this.call('POST', path, body, opts)
  }

  patch<T = Record<string, unknown>>(
    path: string,
    body?: unknown,
    opts: { csrf?: boolean } = {},
  ): Promise<E2eResponse<T>> {
    return this.call('PATCH', path, body, opts)
  }

  delete<T = Record<string, unknown>>(
    path: string,
    opts: { csrf?: boolean } = {},
  ): Promise<E2eResponse<T>> {
    return this.call('DELETE', path, undefined, opts)
  }

  register(input: AuthInput): Promise<E2eResponse<{ id: string; email: string }>> {
    return this.post('/api/auth/register', { consentTermsVersion: 'v1', ...input })
  }

  async verifyEmail(email: string): Promise<E2eResponse<{ status: boolean }>> {
    const token = await mintEmailVerificationToken(email)
    return await this.post('/api/auth/email/verification/confirm', { token })
  }

  login(email: string, password: string): Promise<E2eResponse<{ id: string; email: string }>> {
    return this.post('/api/auth/login', { email, password })
  }
}

/**
 * Owner DB (bypassa RLS) — APENAS setup/seeding/cleanup do e2e, nunca
 * asserção (isso vai pelo HTTP).
 */
function ownerSql(): postgres.Sql {
  return postgres(TEST_OWNER_URL, { onnotice: () => {} })
}

/** Janela de rate-limit/lockout é chaveada por IP/email compartilhados — reset por teste. */
export async function resetRateLimits(): Promise<void> {
  const sql = ownerSql()
  try {
    await sql.unsafe(
      `DELETE FROM auth_security_state WHERE key LIKE 'rate:%' OR key LIKE 'lockout:%'`,
    )
  } finally {
    await sql.end()
  }
}

/** Membro (não-owner) semeado via owner DB — setup explícito do cenário. */
export async function seedCompanyMember(
  companyId: string,
  userId: string,
  locationId: string,
): Promise<void> {
  const sql = ownerSql()
  try {
    await sql.unsafe(
      `INSERT INTO company_member (company_id, user_id, role, default_location_id)
       VALUES ($1, $2, 'member', $3)`,
      [companyId, userId, locationId],
    )
  } finally {
    await sql.end()
  }
}

/** Faz o banco recusar o evento de convite do usuário desta fixture. */
export async function withRejectedAudit<T>(run: () => Promise<T>): Promise<T> {
  const sql = ownerSql()
  try {
    await sql`
      ALTER TABLE auth_event ADD CONSTRAINT e2e_reject_invite_audit
      CHECK (event_type <> 'invite_created' OR email NOT LIKE 'invite-audit-%@e2e.test') NOT VALID
    `
    try {
      return await run()
    } finally {
      await sql`ALTER TABLE auth_event DROP CONSTRAINT e2e_reject_invite_audit`
    }
  } finally {
    await sql.end()
  }
}

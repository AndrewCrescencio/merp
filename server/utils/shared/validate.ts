import {
  checkPasswordBreach,
  EMAIL_REGEX,
  isWeakPassword,
  MAX_CONSENT_VERSION_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  normalizeEmail,
  sendValidationError,
} from './index'

export interface RegisterInput {
  email: string
  password: string
  name: string
  // Obrigatório: validateRegisterInput recusa registro sem aceite (FR-021), e
  // o campo não pode ficar opcional sob risco de um chamador pular o validador.
  consentTermsVersion: string
}

export interface LoginInput {
  email: string
  password: string
  rememberMe?: boolean
}

export interface CompanyCreateInput {
  name: string
  cnpj?: string
  razaoSocial?: string
}

export interface InviteInput {
  email: string
}

export interface ResetPasswordInput {
  token: string
  newPassword: string
}

export interface VerifyEmailInput {
  token: string
}

export interface ForgetPasswordInput {
  email: string
}

export interface SendVerificationEmailInput {
  email: string
}

export async function validateRegisterInput(rawBody: unknown): Promise<RegisterInput> {
  const body = rawBody as Record<string, unknown>
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''

  if (!email || !EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LENGTH) {
    sendValidationError('Valid email is required')
  }

  if (!body?.password || typeof body.password !== 'string' || body.password.length < 8) {
    sendValidationError('Password must be at least 8 characters')
  }

  if (body.password.length > MAX_PASSWORD_LENGTH) {
    sendValidationError('Password must be at most 128 characters')
  }

  if (isWeakPassword(body.password)) {
    sendValidationError('Password is too common. Choose a stronger password.')
  }

  const breach = await checkPasswordBreach(body.password)
  if (breach.breached) {
    sendValidationError(
      'This password has appeared in data breaches. Please choose a different password.',
    )
  }

  if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    sendValidationError('Name is required')
  }

  if (body.name.trim().length > MAX_NAME_LENGTH) {
    sendValidationError('Name must be at most 120 characters')
  }

  if (
    !body?.consentTermsVersion ||
    typeof body.consentTermsVersion !== 'string' ||
    body.consentTermsVersion.trim().length === 0
  ) {
    sendValidationError('consentTermsVersion is required')
  }

  if (body.consentTermsVersion.trim().length > MAX_CONSENT_VERSION_LENGTH) {
    sendValidationError('consentTermsVersion must be at most 50 characters')
  }

  return {
    email,
    password: body.password,
    name: body.name.trim(),
    consentTermsVersion: body.consentTermsVersion.trim(),
  }
}

export function validateLoginInput(rawBody: unknown): LoginInput {
  const body = rawBody as Record<string, unknown>
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''

  if (!email || typeof body?.password !== 'string' || !body.password) {
    sendValidationError('Email and password are required')
  }

  if (email.length > MAX_EMAIL_LENGTH || body.password.length > MAX_PASSWORD_LENGTH) {
    sendValidationError('Invalid email or password')
  }

  return {
    email,
    password: body.password,
    rememberMe: body.rememberMe === true,
  }
}

export function validateCompanyCreateInput(rawBody: unknown): CompanyCreateInput {
  const body = rawBody as Record<string, unknown>
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    sendValidationError('Company name is required')
  }

  if (body.name.trim().length > 200) {
    sendValidationError('Company name must be at most 200 characters')
  }

  if (body.cnpj !== undefined && typeof body.cnpj !== 'string') {
    sendValidationError('cnpj must be a string')
  }
  const cnpj = body.cnpj?.trim() || undefined
  if (cnpj && cnpj.length > 30) {
    sendValidationError('cnpj must be at most 30 characters')
  }

  if (body.razaoSocial !== undefined && typeof body.razaoSocial !== 'string') {
    sendValidationError('razaoSocial must be a string')
  }
  const razaoSocial = body.razaoSocial?.trim() || undefined
  if (razaoSocial && razaoSocial.length > 200) {
    sendValidationError('razaoSocial must be at most 200 characters')
  }

  return {
    name: body.name.trim(),
    cnpj,
    razaoSocial,
  }
}

export function validateInviteInput(rawBody: unknown): InviteInput {
  const body = rawBody as Record<string, unknown>
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email || !EMAIL_REGEX.test(email)) {
    sendValidationError('A valid email is required')
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    sendValidationError('A valid email is required')
  }

  return { email }
}

export function validateResetPasswordInput(rawBody: unknown): ResetPasswordInput {
  const body = rawBody as Record<string, unknown>
  if (!body?.newPassword || typeof body.newPassword !== 'string' || body.newPassword.length < 8) {
    sendValidationError('Password must be at least 8 characters')
  }

  if (body.newPassword.length > MAX_PASSWORD_LENGTH) {
    sendValidationError('Password must be at most 128 characters')
  }

  if (isWeakPassword(body.newPassword)) {
    sendValidationError('Password is too common. Choose a stronger password.')
  }

  // R6: token só no body — nunca em path/query da API.
  const token = typeof body?.token === 'string' && body.token ? body.token : ''
  if (!token) {
    sendValidationError('Invalid or expired reset link')
  }

  return { token, newPassword: body.newPassword }
}

// R6: token só no body — a página Nuxt lê o token da URL e faz POST com ele no body.
export function validateVerifyEmailInput(rawBody: unknown): VerifyEmailInput {
  const body = rawBody as Record<string, unknown>
  const token = body?.token
  if (typeof token !== 'string' || !token) {
    sendValidationError('Invalid or expired verification link')
  }
  return { token }
}

export function validateForgetPasswordInput(rawBody: unknown): ForgetPasswordInput {
  const body = rawBody as Record<string, unknown>
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email || !EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LENGTH) {
    sendValidationError('Valid email is required')
  }
  return { email }
}

export function validateSendVerificationEmailInput(rawBody: unknown): SendVerificationEmailInput {
  const body = rawBody as Record<string, unknown>
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email || !EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LENGTH) {
    sendValidationError('Valid email is required')
  }
  return { email }
}

export function validateCompanySearchInput(rawQuery: unknown): { q: string } {
  const query = rawQuery as Record<string, unknown>
  if (!query.q || typeof query.q !== 'string' || query.q.trim().length === 0) {
    sendValidationError('Search query is required')
  }
  if (query.q.trim().length > 100) {
    sendValidationError('Search query must be at most 100 characters')
  }
  return { q: query.q.trim() }
}

// Update aceita campos opcionais (o caller lê `name?`), ao contrário do create.
export function validateCompanyUpdateInput(rawBody: unknown): Partial<CompanyCreateInput> {
  const body = rawBody as Record<string, unknown>

  const input: Partial<CompanyCreateInput> = {}
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      sendValidationError('Company name must be a non-empty string')
    }
    const name = body.name.trim()
    if (name.length > 200) {
      sendValidationError('Company name must be at most 200 characters')
    }
    input.name = name
  }
  if (body.cnpj !== undefined) {
    if (typeof body.cnpj !== 'string') {
      sendValidationError('cnpj must be a string')
    }
    const cnpj = body.cnpj.trim() || undefined
    if (cnpj && cnpj.length > 30) {
      sendValidationError('cnpj must be at most 30 characters')
    }
    input.cnpj = cnpj
  }
  if (body.razaoSocial !== undefined) {
    if (typeof body.razaoSocial !== 'string') {
      sendValidationError('razaoSocial must be a string')
    }
    const razaoSocial = body.razaoSocial.trim() || undefined
    if (razaoSocial && razaoSocial.length > 200) {
      sendValidationError('razaoSocial must be at most 200 characters')
    }
    input.razaoSocial = razaoSocial
  }
  if (Object.keys(input).length === 0) {
    sendValidationError('At least one field (name, cnpj, razaoSocial) is required')
  }
  return input
}

export function validateInviteAcceptInput(rawBody: unknown): { token: string } {
  const body = rawBody as Record<string, unknown>
  if (!body?.token || typeof body.token !== 'string' || body.token.length === 0) {
    sendValidationError('token is required')
  }
  return { token: body.token }
}

export function validateConsentWithdrawInput(_body: unknown): Record<string, never> {
  // No body validation needed for consent withdrawal
  return {}
}

/**
 * Atribuição de loja padrão do membro. `null` é legítimo: limpa a atribuição e
 * devolve o membro ao escopo company (estado dono/administrador).
 */
export function validateDefaultLocationInput(rawBody: unknown): {
  defaultLocationId: string | null
} {
  const body = rawBody as Record<string, unknown> | null
  const value = body?.defaultLocationId

  if (value === null) {
    return { defaultLocationId: null }
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    sendValidationError('defaultLocationId must be a location id or null')
  }
  return { defaultLocationId: value }
}

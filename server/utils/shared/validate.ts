import { checkPasswordBreach } from './hibp'
import {
  EMAIL_REGEX,
  isWeakPassword,
  MAX_CONSENT_VERSION_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  normalizeEmail,
} from './security'
import { sendValidationError } from './errors'

export interface RegisterInput {
  email: string
  password: string
  name: string
  // Obrigatório: validateRegisterInput recusa registro sem aceite, e
  // o campo não pode ficar opcional sob risco de um chamador pular o validador.
  consentTermsVersion: string
}

export interface CompanyCreateInput {
  name: string
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
  const body = (rawBody ?? {}) as Record<string, unknown>
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

export function validateCompanyCreateInput(rawBody: unknown): CompanyCreateInput {
  const body = (rawBody ?? {}) as Record<string, unknown>
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    sendValidationError('Company name is required')
  }

  if (body.name.trim().length > 200) {
    sendValidationError('Company name must be at most 200 characters')
  }

  return {
    name: body.name.trim(),
  }
}

export function validateInviteInput(rawBody: unknown): InviteInput {
  const body = (rawBody ?? {}) as Record<string, unknown>
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
  const body = (rawBody ?? {}) as Record<string, unknown>
  if (!body?.newPassword || typeof body.newPassword !== 'string' || body.newPassword.length < 8) {
    sendValidationError('Password must be at least 8 characters')
  }

  if (body.newPassword.length > MAX_PASSWORD_LENGTH) {
    sendValidationError('Password must be at most 128 characters')
  }

  if (isWeakPassword(body.newPassword)) {
    sendValidationError('Password is too common. Choose a stronger password.')
  }

  // token só no body — nunca em path/query da API.
  const token = typeof body?.token === 'string' && body.token ? body.token : ''
  if (!token) {
    sendValidationError('Invalid or expired reset link')
  }

  return { token, newPassword: body.newPassword }
}

// token só no body — a página Nuxt lê o token da URL e faz POST com ele no body.
export function validateVerifyEmailInput(rawBody: unknown): VerifyEmailInput {
  const body = (rawBody ?? {}) as Record<string, unknown>
  const token = body?.token
  if (typeof token !== 'string' || !token) {
    sendValidationError('Invalid or expired verification link')
  }
  return { token }
}

export function validateForgetPasswordInput(rawBody: unknown): ForgetPasswordInput {
  const body = (rawBody ?? {}) as Record<string, unknown>
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email || !EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LENGTH) {
    sendValidationError('Valid email is required')
  }
  return { email }
}

export function validateSendVerificationEmailInput(rawBody: unknown): SendVerificationEmailInput {
  const body = (rawBody ?? {}) as Record<string, unknown>
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email || !EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LENGTH) {
    sendValidationError('Valid email is required')
  }
  return { email }
}

export function validateCompanySearchInput(rawQuery: unknown): { q: string } {
  const query = (rawQuery ?? {}) as Record<string, unknown>
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
  const body = (rawBody ?? {}) as Record<string, unknown>

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
  if (Object.keys(input).length === 0) {
    sendValidationError('At least one field (name) is required')
  }
  return input
}

export function validateInviteAcceptInput(rawBody: unknown): { token: string } {
  const body = (rawBody ?? {}) as Record<string, unknown>
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
  const body = (rawBody ?? {}) as Record<string, unknown> | null
  const value = body?.defaultLocationId

  if (value === null) {
    return { defaultLocationId: null }
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    sendValidationError('defaultLocationId must be a location id or null')
  }
  return { defaultLocationId: value }
}

export interface LoginInput {
  email: string
  password: string
  rememberMe: boolean
}

// Só a forma do pedido: os tetos de tamanho ficam no handler, porque lá viram
// 401 genérico (igual a credencial inválida) e não 400 — sem oráculo.
export function validateLoginInput(rawBody: unknown): LoginInput {
  const body = (rawBody ?? {}) as Record<string, unknown>
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  // typeof password entra na validação — senha numérica passava por
  // !body?.password e derrubava no `.length`/scrypt com TypeError → 500.
  if (!email || typeof body.password !== 'string' || !body.password) {
    sendValidationError('Email and password are required')
  }
  return { email, password: body.password, rememberMe: body.rememberMe === true }
}

const MAX_LOCATION_NAME_LENGTH = 200

export function validateLocationCreateInput(rawBody: unknown): { name: string } {
  const body = (rawBody ?? {}) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > MAX_LOCATION_NAME_LENGTH) {
    sendValidationError('name is required and must be a string of at most 200 characters')
  }
  return { name }
}

export function validateLocationUpdateInput(rawBody: unknown): {
  name?: string
  isActive?: boolean
} {
  const body = (rawBody ?? {}) as Record<string, unknown>
  const input: { name?: string; isActive?: boolean } = {}
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > MAX_LOCATION_NAME_LENGTH) {
      sendValidationError('name or isActive is required')
    }
    input.name = name
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      sendValidationError('name or isActive is required')
    }
    input.isActive = body.isActive
  }
  if (Object.keys(input).length === 0) {
    sendValidationError('name or isActive is required')
  }
  return input
}

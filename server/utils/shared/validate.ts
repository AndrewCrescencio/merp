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
  companyId: string
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

export async function validateRegisterInput(body: unknown): Promise<RegisterInput> {
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

export function validateLoginInput(body: unknown): LoginInput {
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

export function validateCompanyCreateInput(body: unknown): CompanyCreateInput {
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

export function validateInviteInput(body: unknown): InviteInput {
  if (!body?.companyId || typeof body.companyId !== 'string') {
    sendValidationError('companyId is required')
  }

  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email || !EMAIL_REGEX.test(email)) {
    sendValidationError('A valid email is required')
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    sendValidationError('A valid email is required')
  }

  return { companyId: body.companyId, email }
}

export function validateResetPasswordInput(body: unknown, query: unknown): ResetPasswordInput {
  if (!body?.newPassword || typeof body.newPassword !== 'string' || body.newPassword.length < 8) {
    sendValidationError('Password must be at least 8 characters')
  }

  if (body.newPassword.length > MAX_PASSWORD_LENGTH) {
    sendValidationError('Password must be at most 128 characters')
  }

  if (isWeakPassword(body.newPassword)) {
    sendValidationError('Password is too common. Choose a stronger password.')
  }

  const token = typeof body?.token === 'string' && body.token ? body.token : query.token
  if (typeof token !== 'string' || !token) {
    sendValidationError('Invalid or expired reset link')
  }

  return { token, newPassword: body.newPassword }
}

export function validateVerifyEmailInput(query: unknown): VerifyEmailInput {
  const token = query.token
  if (typeof token !== 'string' || !token) {
    sendValidationError('Invalid or expired verification link')
  }
  return { token }
}

export function validateForgetPasswordInput(body: unknown): ForgetPasswordInput {
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email || !EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LENGTH) {
    sendValidationError('Valid email is required')
  }
  return { email }
}

export function validateSendVerificationEmailInput(body: unknown): SendVerificationEmailInput {
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  if (!email || !EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LENGTH) {
    sendValidationError('Valid email is required')
  }
  return { email }
}

export function validateCompanySearchInput(query: unknown): { q: string } {
  if (!query.q || typeof query.q !== 'string' || query.q.trim().length === 0) {
    sendValidationError('Search query is required')
  }
  if (query.q.trim().length > 100) {
    sendValidationError('Search query must be at most 100 characters')
  }
  return { q: query.q.trim() }
}

export function validateCompanySwitchInput(body: unknown): { companyId: string } {
  if (!body.companyId || typeof body.companyId !== 'string') {
    sendValidationError('Company ID is required')
  }
  return { companyId: body.companyId }
}

export function validateCompanyUpdateInput(body: unknown): CompanyCreateInput {
  if (!body?.companyId || typeof body.companyId !== 'string') {
    sendValidationError('companyId is required')
  }

  const input: CompanyCreateInput = {}
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

export function validateDeleteCompanyInput(body: unknown): { companyId: string } {
  if (!body?.companyId || typeof body.companyId !== 'string') {
    sendValidationError('companyId is required')
  }
  return { companyId: body.companyId }
}

export function validateRemoveMemberInput(body: unknown): { companyId: string; userId?: string } {
  if (!body?.companyId || typeof body.companyId !== 'string') {
    sendValidationError('companyId is required')
  }
  if (body.userId !== undefined && (typeof body.userId !== 'string' || body.userId.trim() === '')) {
    sendValidationError('userId must be a non-empty string')
  }
  return { companyId: body.companyId, userId: body.userId?.trim() }
}

export function validateInviteAcceptInput(body: unknown): { token: string } {
  if (!body?.token || typeof body.token !== 'string' || body.token.length === 0) {
    sendValidationError('token is required')
  }
  return { token: body.token }
}

export function validateConsentWithdrawInput(_body: unknown): Record<string, never> {
  // No body validation needed for consent withdrawal
  return {}
}

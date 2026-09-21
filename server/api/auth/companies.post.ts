import { defineEventHandler, readBody, createError, setResponseStatus } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import {
  checkIpRateLimit,
  isValidCnpj,
  MAX_CNPJ_LENGTH,
  MAX_COMPANY_NAME_LENGTH,
  MAX_RAZAO_SOCIAL_LENGTH,
} from '~~/server/utils/shared/security'
import { sendValidationError } from '~~/server/utils/shared/errors'

export default defineEventHandler(async (event) => {
  // AUD-14: rate limit por IP antes do readBody (mesmo padrão do invite.post,
  // AUD-11) — criação de empresa é mutação barata de abusar (INSERT por
  // request, sem teto por sessão).
  await checkIpRateLimit(event)

  const user = event.context.user as { id: string } | undefined
  if (!user) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const body = await readBody<{ name?: string; cnpj?: string; razaoSocial?: string }>(event)

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    sendValidationError('Company name is required')
  }

  // AUD-21: tetos de tamanho — PII corporativa não vira coluna gigante.
  if (body.name.trim().length > MAX_COMPANY_NAME_LENGTH) {
    sendValidationError('Company name must be at most 200 characters')
  }

  // AUD-23: body types lax → TypeError → 500; validar antes de trim.
  if (body.cnpj !== undefined && typeof body.cnpj !== 'string') {
    sendValidationError('cnpj must be a string')
  }
  const cnpj = body.cnpj?.trim() || undefined
  if (cnpj && cnpj.length > MAX_CNPJ_LENGTH) {
    sendValidationError('cnpj must be at most 30 characters')
  }
  if (cnpj && !isValidCnpj(cnpj)) {
    sendValidationError('cnpj is invalid')
  }

  if (body.razaoSocial !== undefined && typeof body.razaoSocial !== 'string') {
    sendValidationError('razaoSocial must be a string')
  }
  const razaoSocial = body.razaoSocial?.trim() || undefined
  if (razaoSocial && razaoSocial.length > MAX_RAZAO_SOCIAL_LENGTH) {
    sendValidationError('razaoSocial must be at most 200 characters')
  }

  const created = await companyRepository.createCompanyWithOwner(
    {
      name: body.name.trim(),
      cnpj,
      razaoSocial,
    },
    user.id,
  )

  setResponseStatus(event, 201)
  return {
    id: created.id,
    name: created.name,
  }
})

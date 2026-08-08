import { defineEventHandler, getQuery, createError } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import { sendValidationError } from '~~/server/utils/shared/errors'

export default defineEventHandler(async (event) => {
  const user = event.context.user as { id: string } | undefined
  if (!user) {
    throw createError({
      status: 401,
      statusText: '401',
      message: JSON.stringify({ error: 'unauthorized', message: 'Authentication required.' }),
    })
  }

  const query = getQuery<{ q?: string }>(event)

  if (!query.q || typeof query.q !== 'string' || query.q.trim().length === 0) {
    sendValidationError('Search query is required')
  }

  const companies = await companyRepository.searchCompanies(query.q.trim())

  return { companies: companies.map((c) => ({ id: c.id, name: c.name, cnpj: c.cnpj })) }
})

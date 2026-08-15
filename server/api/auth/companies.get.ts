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

  // AUD-10: escopada por vínculo — o repositório só retorna empresas onde
  // user.id é member (antes: busca global, vazava nome+CNPJ de tudo).
  const companies = await companyRepository.searchCompanies(query.q.trim(), user.id)

  return { companies: companies.map((c) => ({ id: c.id, name: c.name, cnpj: c.cnpj })) }
})

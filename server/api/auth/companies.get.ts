import { getQuery, createError } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import { defineAuthHandler, validateCompanySearchInput } from '~~/server/utils/shared'

export default defineAuthHandler(async (event, user) => {
  const { q } = validateCompanySearchInput(getQuery(event))

  const companies = await companyRepository.searchCompanies(q, user.id)

  return { companies: companies.map((c) => ({ id: c.id, name: c.name, cnpj: c.cnpj })) }
})

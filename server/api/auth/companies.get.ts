import { getQuery } from 'h3'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
import { defineAuthHandler, validateCompanySearchInput } from '~~/server/utils/shared'

export default defineAuthHandler(async (event, user) => {
  const { q } = validateCompanySearchInput(getQuery(event))

  const companies = await membershipRepository.searchCompanies(q, user.id)

  return { companies: companies.map((c) => ({ id: c.id, name: c.name, cnpj: c.cnpj })) }
})

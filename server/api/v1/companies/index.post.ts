import { readBody, setHeader, setResponseStatus } from 'h3'
import { companyRepository } from '~~/server/utils/auth/company/repository'
import {
  checkIpRateLimit,
  defineAuthHandler,
  validateCompanyCreateInput,
} from '~~/server/utils/shared'

export default defineAuthHandler(async (event, user) => {
  await checkIpRateLimit(event)

  const { name } = validateCompanyCreateInput(await readBody(event))

  const created = await companyRepository.createCompanyWithOwner({ name }, user.id)

  setResponseStatus(event, 201)
  setHeader(event, 'Location', `/api/v1/companies/${created.id}`)
  return { id: created.id, name: created.name }
})

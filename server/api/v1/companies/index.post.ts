import { companyRepository } from '~~/server/utils/auth/company/repository'
import { defineAuthHandler, validateCompanyCreateInput } from '~~/server/utils/shared'

export default defineAuthHandler(
  {
    rateLimit: 'ip',
    body: validateCompanyCreateInput,
    created: ({ id }: { id: string }) => `/api/v1/companies/${id}`,
  },
  async ({ body, user }) => {
    const created = await companyRepository.createCompanyWithOwner(body, user.id)
    return { id: created.id, name: created.name }
  },
)

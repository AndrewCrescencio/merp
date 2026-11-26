import { recordProductMilestone } from '~~/server/utils/insights/product'
import { companyRepository } from '~~/server/utils/companies/company/repository'
import { defineAuthHandler, validateCompanyCreateInput } from '~~/server/utils/shared'

export default defineAuthHandler(
  {
    rateLimit: 'ip',
    body: validateCompanyCreateInput,
    created: ({ id }: { id: string }) => `/api/v1/companies/${id}`,
  },
  async ({ body, event, user }) => {
    const created = await companyRepository.createCompanyWithOwner(body, user.id)
    recordProductMilestone(event, 'company_created')
    return { id: created.id, name: created.name }
  },
)

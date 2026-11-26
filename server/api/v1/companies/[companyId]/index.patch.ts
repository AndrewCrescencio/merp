import { companyRepository } from '~~/server/utils/companies/company/repository'
import { defineAuthHandler, ROLES } from '~~/server/utils/shared'
import { companyUpdateSchema } from '~~/shared/contracts/company'

export default defineAuthHandler(
  {
    tenant: true,
    role: ROLES.owner,
    forbiddenMessage: 'Only company owners can update companies',
    body: companyUpdateSchema,
    audit: (_, { tenant }) => ({
      eventType: 'company_updated',
      metadata: { companyId: tenant.companyId },
    }),
  },
  ({ tenant, user, body }) => companyRepository.updateCompany(tenant.companyId, user.id, body),
)

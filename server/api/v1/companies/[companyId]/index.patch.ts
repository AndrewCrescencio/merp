import { companyRepository } from '~~/server/utils/auth/company/repository'
import { defineAuthHandler, ROLES, validateCompanyUpdateInput } from '~~/server/utils/shared'

export default defineAuthHandler(
  {
    tenant: true,
    role: ROLES.owner,
    forbiddenMessage: 'Only company owners can update companies',
    body: validateCompanyUpdateInput,
    audit: (_, { tenant }) => ({
      eventType: 'company_updated',
      metadata: { companyId: tenant.companyId },
    }),
  },
  ({ tenant, user, body }) => companyRepository.updateCompany(tenant.companyId, user.id, body),
)

import { companyRepository } from '~~/server/utils/auth/company/repository'
import { defineAuthHandler, ROLES } from '~~/server/utils/shared'

export default defineAuthHandler(
  {
    tenant: true,
    role: ROLES.owner,
    forbiddenMessage: 'Only company owners can delete companies',
    audit: (_, { tenant }) => ({
      eventType: 'company_deleted',
      metadata: { companyId: tenant.companyId },
    }),
  },
  async ({ tenant, user }) => {
    await companyRepository.softDeleteCompany(tenant.companyId, user.id)
    // Nitro envia 204 para null após o wrapper registrar a auditoria.
    return null
  },
)

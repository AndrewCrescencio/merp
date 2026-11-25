import { inviteRepository } from '~~/server/utils/auth/invite/repository'
import { defineAuthHandler } from '~~/server/utils/shared'

// Qualquer membro lista os convites; empresa inexistente ou não-membro já
// viram 404 no middleware de tenant (sem enumeração de companyId).
export default defineAuthHandler({ tenant: true, role: 'any' }, async ({ tenant }) => {
  const invites = await inviteRepository.listCompanyInvites(tenant.companyId)
  return { invites }
})

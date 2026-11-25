import { inviteRepository } from '~~/server/utils/auth/invite/repository'
import { assertRole, defineAuthHandler, requireTenant } from '~~/server/utils/shared'

// Qualquer membro lista os convites; empresa inexistente ou não-membro já
// viram 404 no middleware de tenant (sem enumeração de companyId).
export default defineAuthHandler(async (event) => {
  const { companyId, role } = requireTenant(event)
  assertRole(role, null, 'You are not a member of this company')

  const invites = await inviteRepository.listCompanyInvites(companyId)
  return { invites }
})

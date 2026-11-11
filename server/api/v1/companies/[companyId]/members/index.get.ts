import { membershipRepository } from '~~/server/utils/auth/company/membership'
import { assertRole, defineAuthHandler, requireTenant } from '~~/server/utils/shared'

export default defineAuthHandler(async (event, user) => {
  const { companyId, role } = requireTenant(event)

  // Apenas o owner pode listar membros (o papel `manager` não existe).
  await assertRole(
    role,
    'owner',
    'You are not a member of this company',
    'Only company owners can list members',
  )

  const members = await membershipRepository.listCompanyMembers(companyId, user.id)

  return { members }
})

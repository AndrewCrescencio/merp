import { defineEventHandler } from 'h3'
import { requireTenant, requireUser } from '~~/server/utils/shared/auth-context'
import { membershipRepository } from '~~/server/utils/auth/company/membership'
import { assertRole, ROLES } from '~~/server/utils/shared'

export default defineEventHandler(async (event) => {
  const { companyId, role } = requireTenant(event)
  const user = requireUser(event)

  // Apenas o owner pode listar membros (o papel `manager` não existe).
  await assertRole(
    role,
    ROLES.owner,
    'You are not a member of this company',
    'Only company owners can list members',
  )

  const members = await membershipRepository.listCompanyMembers(companyId, user.id)

  return { members }
})

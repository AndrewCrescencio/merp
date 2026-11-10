import { defineEventHandler, readBody, setHeader, setResponseStatus } from 'h3'
import { z } from 'zod'
import { locationRepository } from '~~/server/utils/auth/company/location-repository'
import { requireTenant, requireUser } from '~~/server/utils/shared/auth-context'
import { assertRole, ROLES, sendValidationError } from '~~/server/utils/shared'

const createLocationSchema = z.object({
  name: z.string().min(1).max(200),
})

export default defineEventHandler(async (event) => {
  const user = requireUser(event)

  const { companyId, role } = requireTenant(event)
  await assertRole(
    role,
    ROLES.owner,
    'You are not a member of this company',
    'Only company owners can create locations',
  )

  const body = await readBody(event)
  const parsed = createLocationSchema.safeParse(body)
  if (!parsed.success) {
    sendValidationError('name is required and must be a string of at most 200 characters')
  }

  const location = await locationRepository.createLocation(companyId, user.id, parsed.data)

  // criação → 201 + Location do recurso criado.
  setResponseStatus(event, 201)
  setHeader(event, 'Location', `/api/v1/companies/${companyId}/locations/${location.id}`)
  return location
})

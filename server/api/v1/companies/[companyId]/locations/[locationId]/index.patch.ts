import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { locationRepository } from '~~/server/utils/auth/company/location-repository'
import {
  assertRole,
  defineAuthHandler,
  ROLES,
  requireTenant,
  sendNotFoundError,
  sendValidationError,
} from '~~/server/utils/shared'

const updateLocationSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.name !== undefined || data.isActive !== undefined, {
    message: 'name or isActive is required',
  })

export default defineAuthHandler(async (event, user) => {
  const { companyId, role } = requireTenant(event)
  await assertRole(
    role,
    ROLES.owner,
    'You are not a member of this company',
    'Only company owners can update locations',
  )

  const locationId = getRouterParam(event, 'locationId')
  if (!locationId) {
    sendNotFoundError('Location not found')
  }

  const body = await readBody(event)
  const parsed = updateLocationSchema.safeParse(body)
  if (!parsed.success) {
    sendValidationError('name or isActive is required')
  }

  return await locationRepository.updateLocation(companyId, user.id, locationId!, parsed.data)
})

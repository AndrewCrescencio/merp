import { defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { requireTenant } from '~~/server/utils/shared/auth-context'
import { kitchenStationRepository } from '~~/server/utils/auth/company/kitchen-station-repository'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'
import { sendValidationError } from '~~/server/utils/shared'

const updateStationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const { companyId, stationId } = event.context.params as { companyId: string; stationId: string }
  const auth = await requireTenant(event)

  // Only owner/manager can update stations
  await assertCompanyRole(companyId, auth.user.id, ['owner', 'manager'])

  const body = await readBody(event)
  const validation = updateStationSchema.safeParse(body)

  if (!validation.success) {
    sendValidationError('invalid_station_data')
  }

  const station = await kitchenStationRepository.updateStation(companyId, auth.user.id, stationId, {
    name: validation.data.name,
    displayOrder: validation.data.displayOrder,
    isActive: validation.data.isActive,
  })

  return station
})

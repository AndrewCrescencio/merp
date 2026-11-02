import { defineEventHandler, readBody, setHeader, setResponseStatus } from 'h3'
import { z } from 'zod'
import { requireUser } from '~~/server/utils/shared/auth-context'
import { kitchenStationRepository } from '~~/server/utils/auth/company/kitchen-station-repository'
import { assertCompanyRole } from '~~/server/utils/auth/company/authorization'
import { sendValidationError } from '~~/server/utils/shared'

const createStationSchema = z.object({
  name: z.string().min(1).max(100),
  displayOrder: z.number().int().optional(),
  locationId: z.string().uuid(),
  isActive: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const { companyId } = event.context.params as { companyId: string }
  const user = requireUser(event)

  // Only owner/manager can create stations
  await assertCompanyRole(companyId, user.id, ['owner', 'manager'])

  const body = await readBody(event)
  const validation = createStationSchema.safeParse(body)

  if (!validation.success) {
    sendValidationError('invalid_station_data')
  }

  const input = validation.data

  const station = await kitchenStationRepository.createStation(
    companyId,
    user.id,
    input.locationId,
    {
      companyId,
      locationId: input.locationId,
      name: input.name,
      displayOrder: input.displayOrder,
      isActive: input.isActive,
    },
  )

  setResponseStatus(event, 201)
  setHeader(event, 'Location', `/api/v1/companies/${companyId}/kitchen/stations/${station.id}`)
  return station
})

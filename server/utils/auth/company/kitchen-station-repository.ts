import { and, eq } from 'drizzle-orm'
import { sendNotFoundError } from '../../shared'
import { withTenant } from '../../db/tenant-context'
import { kitchenStation } from '../../schema'

export interface CreateKitchenStationInput {
  companyId: string
  locationId: string
  name: string
  displayOrder?: number
  isActive?: boolean
}

export interface UpdateKitchenStationInput {
  name?: string
  displayOrder?: number
  isActive?: boolean
}

export interface KitchenStationResult {
  id: string
  companyId: string
  locationId: string
  name: string
  displayOrder: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/** Kitchen station CRUD repository — every query runs under {@link withTenant} (RLS backstop). */
export class KitchenStationRepository {
  /**
   * Lists stations for a company/location.
   * Accessible to any member.
   */
  async listStations(
    companyId: string,
    userId: string,
    locationId?: string,
  ): Promise<KitchenStationResult[]> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const conditions = [eq(kitchenStation.companyId, companyId)]
      if (locationId) {
        conditions.push(eq(kitchenStation.locationId, locationId))
      }
      return tx
        .select()
        .from(kitchenStation)
        .where(and(...conditions))
        .orderBy(kitchenStation.displayOrder, kitchenStation.name)
    })
  }

  /**
   * Finds a single station.
   * Accessible to any member.
   */
  async findStation(
    companyId: string,
    userId: string,
    stationId: string,
  ): Promise<KitchenStationResult | null> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const [found] = await tx
        .select()
        .from(kitchenStation)
        .where(and(eq(kitchenStation.id, stationId), eq(kitchenStation.companyId, companyId)))
        .limit(1)

      return found || null
    })
  }

  /**
   * Creates a kitchen station. Requires owner/manager permission.
   */
  async createStation(
    companyId: string,
    userId: string,
    locationId: string,
    input: CreateKitchenStationInput,
  ): Promise<KitchenStationResult> {
    return await withTenant(companyId, locationId, userId, async (tx) => {
      const [created] = await tx
        .insert(kitchenStation)
        .values({
          companyId: input.companyId,
          locationId: input.locationId,
          name: input.name.trim(),
          displayOrder: input.displayOrder ?? 0,
          isActive: input.isActive ?? true,
        })
        .returning()
      return created!
    })
  }

  /**
   * Updates a station. Requires owner/manager permission.
   */
  async updateStation(
    companyId: string,
    userId: string,
    stationId: string,
    input: UpdateKitchenStationInput,
  ): Promise<KitchenStationResult> {
    const updates: Partial<typeof kitchenStation.$inferInsert> = { updatedAt: new Date() }
    if (input.name !== undefined) updates.name = input.name.trim()
    if (input.displayOrder !== undefined) updates.displayOrder = input.displayOrder
    if (input.isActive !== undefined) updates.isActive = input.isActive

    return await withTenant(companyId, null, userId, async (tx) => {
      const [updated] = await tx
        .update(kitchenStation)
        .set(updates)
        .where(and(eq(kitchenStation.id, stationId), eq(kitchenStation.companyId, companyId)))
        .returning()

      if (!updated) {
        sendNotFoundError('Kitchen station not found')
      }
      return updated!
    })
  }

  /**
   * Deletes a station physically. Requires owner/manager permission.
   */
  async deleteStation(companyId: string, userId: string, stationId: string): Promise<void> {
    await withTenant(companyId, null, userId, async (tx) => {
      const deleted = await tx
        .delete(kitchenStation)
        .where(and(eq(kitchenStation.id, stationId), eq(kitchenStation.companyId, companyId)))
        .returning({ id: kitchenStation.id })

      if (deleted.length === 0) {
        sendNotFoundError('Kitchen station not found')
      }
    })
  }
}

export const kitchenStationRepository = new KitchenStationRepository()

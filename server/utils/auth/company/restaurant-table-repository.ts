import { and, eq } from 'drizzle-orm'
import { sendNotFoundError, sendValidationError } from '../../shared'
import { withTenant } from '../../db/tenant-context'
import { restaurantTable } from '../../schema'

export interface CreateRestaurantTableInput {
  companyId: string
  locationId: string
  number: number
  name?: string
  capacity?: number
}

export interface UpdateRestaurantTableInput {
  name?: string
  capacity?: number
  status?: string
}

export interface RestaurantTableResult {
  id: string
  companyId: string
  locationId: string
  number: number
  name: string | null
  capacity: number
  status: string
  currentOrderId: string | null
  createdAt: Date
  updatedAt: Date
}

/** Restaurant table CRUD repository — every query runs under {@link withTenant} (RLS backstop). */
export class RestaurantTableRepository {
  /**
   * Lists tables for a company/location.
   * Accessible to any member.
   */
  async listTables(
    companyId: string,
    userId: string,
    locationId?: string,
  ): Promise<RestaurantTableResult[]> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const conditions = [eq(restaurantTable.companyId, companyId)]
      if (locationId) {
        conditions.push(eq(restaurantTable.locationId, locationId))
      }
      return tx
        .select()
        .from(restaurantTable)
        .where(and(...conditions))
        .orderBy(restaurantTable.number)
    })
  }

  /**
   * Finds a single table.
   * Accessible to any member.
   */
  async findTable(
    companyId: string,
    userId: string,
    tableId: string,
  ): Promise<RestaurantTableResult | null> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const [found] = await tx
        .select()
        .from(restaurantTable)
        .where(and(eq(restaurantTable.id, tableId), eq(restaurantTable.companyId, companyId)))
        .limit(1)

      return found || null
    })
  }

  /**
   * Creates a restaurant table. Requires owner/manager permission.
   * Validates unique constraint (company_id, location_id, number).
   */
  async createTable(
    companyId: string,
    userId: string,
    locationId: string,
    input: CreateRestaurantTableInput,
  ): Promise<RestaurantTableResult> {
    return await withTenant(companyId, locationId, userId, async (tx) => {
      try {
        const [created] = await tx
          .insert(restaurantTable)
          .values({
            companyId: input.companyId,
            locationId: input.locationId,
            number: input.number,
            name: input.name || null,
            capacity: input.capacity ?? 4,
            status: 'available',
          })
          .returning()
        return created!
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        if (
          msg.includes('restaurant_table_company_location_number_idx') ||
          msg.includes('duplicate')
        ) {
          sendValidationError('duplicate_table_number')
        }
        throw error
      }
    })
  }

  /**
   * Updates a table. Requires owner/manager permission.
   */
  async updateTable(
    companyId: string,
    userId: string,
    tableId: string,
    input: UpdateRestaurantTableInput,
  ): Promise<RestaurantTableResult> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const updates: Partial<typeof restaurantTable.$inferInsert> = { updatedAt: new Date() }
      if (input.name !== undefined) updates.name = input.name
      if (input.capacity !== undefined) updates.capacity = input.capacity
      if (input.status !== undefined) updates.status = input.status

      const [updated] = await tx
        .update(restaurantTable)
        .set(updates)
        .where(and(eq(restaurantTable.id, tableId), eq(restaurantTable.companyId, companyId)))
        .returning()

      if (!updated) {
        sendNotFoundError('Table not found')
      }
      return updated!
    })
  }

  /**
   * Updates the status of a table.
   */
  async updateStatus(
    companyId: string,
    userId: string,
    tableId: string,
    status: string,
  ): Promise<RestaurantTableResult> {
    return this.updateTable(companyId, userId, tableId, { status })
  }

  /**
   * Updates the current order for a table.
   */
  async updateCurrentOrder(
    companyId: string,
    userId: string,
    tableId: string,
    orderId: string | null,
  ): Promise<RestaurantTableResult> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const [updated] = await tx
        .update(restaurantTable)
        .set({ currentOrderId: orderId, updatedAt: new Date() })
        .where(and(eq(restaurantTable.id, tableId), eq(restaurantTable.companyId, companyId)))
        .returning()

      if (!updated) {
        sendNotFoundError('Table not found')
      }
      return updated!
    })
  }

  /**
   * Deletes a table physically. Requires owner/manager permission.
   */
  async deleteTable(companyId: string, userId: string, tableId: string): Promise<void> {
    await withTenant(companyId, null, userId, async (tx) => {
      const deleted = await tx
        .delete(restaurantTable)
        .where(and(eq(restaurantTable.id, tableId), eq(restaurantTable.companyId, companyId)))
        .returning({ id: restaurantTable.id })

      if (deleted.length === 0) {
        sendNotFoundError('Table not found')
      }
    })
  }
}

export const restaurantTableRepository = new RestaurantTableRepository()

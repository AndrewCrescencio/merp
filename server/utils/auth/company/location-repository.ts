import { and, eq } from 'drizzle-orm'
import { location } from '../../schema'
import { withTenant } from '../../db/tenant-context'
import { sendNotFoundError } from '../../shared/errors'
import type { LocationResult } from './repository'

export interface CreateLocationInput {
  name: string
}

export interface UpdateLocationInput {
  name?: string
  isActive?: boolean
}

/** Location repository — every query runs under {@link withTenant} (RLS backstop). */
export class LocationRepository {
  /**
   * Lists active locations for a company.
   * Any company member can read.
   */
  async listLocations(companyId: string, userId: string): Promise<LocationResult[]> {
    return await withTenant(companyId, null, userId, async (tx) => {
      return await tx
        .select()
        .from(location)
        .where(and(eq(location.companyId, companyId), eq(location.isActive, true)))
    })
  }

  /**
   * Creates a new location for a company.
   * Owner-only (checked by caller via assertCompanyRole); RLS backstop is
   * tenant-level, same as membership repositories. Runs with
   * app.location_id = NULL so the INSERT passes the location policy
   * (id = get_location_id() OR get_location_id() IS NULL).
   */
  async createLocation(
    companyId: string,
    userId: string,
    input: CreateLocationInput,
  ): Promise<LocationResult> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const [row] = await tx
        .insert(location)
        .values({ companyId, name: input.name, isActive: true })
        .returning()
      return row!
    })
  }

  /**
   * Updates a location (name and/or isActive).
   * Owner-only (checked by caller via assertCompanyRole).
   */
  async updateLocation(
    companyId: string,
    userId: string,
    locationId: string,
    input: UpdateLocationInput,
  ): Promise<LocationResult> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const updates: Partial<typeof location.$inferInsert> = { updatedAt: new Date() }
      if (input.name !== undefined) updates.name = input.name
      if (input.isActive !== undefined) updates.isActive = input.isActive

      const [updated] = await tx
        .update(location)
        .set(updates)
        .where(and(eq(location.id, locationId), eq(location.companyId, companyId)))
        .returning()

      if (!updated) {
        sendNotFoundError('Location not found')
      }
      return updated!
    })
  }

  /**
   * Soft-deletes a location (sets isActive = false).
   * Owner-only (checked by caller via assertCompanyRole).
   */
  async softDeleteLocation(
    companyId: string,
    userId: string,
    locationId: string,
  ): Promise<LocationResult> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const [updated] = await tx
        .update(location)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(location.id, locationId), eq(location.companyId, companyId)))
        .returning()

      if (!updated) {
        sendNotFoundError('Location not found')
      }
      return updated!
    })
  }

  /**
   * Finds a location by ID within a company (including inactive).
   * Used for cross-tenant checks.
   */
  async findLocationById(
    companyId: string,
    userId: string,
    locationId: string,
  ): Promise<LocationResult | null> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const [found] = await tx
        .select()
        .from(location)
        .where(and(eq(location.id, locationId), eq(location.companyId, companyId)))
        .limit(1)
      return found || null
    })
  }
}

export const locationRepository = new LocationRepository()

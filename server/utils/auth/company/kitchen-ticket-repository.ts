import { and, eq } from 'drizzle-orm'
import { sendNotFoundError, sendValidationError } from '../../shared'
import { withTenant } from '../../db/tenant-context'
import { kitchenTicket, orderItem, kitchenStation } from '../../schema'

export type KitchenTicketStatus = 'pending' | 'in_progress' | 'ready' | 'served' | 'cancelled'

// FSM kitchen_ticket (spec em tag pre-reset-limpo: specs/packs/restaurant/spec.md)
// served/cancelled são terminais.
const KITCHEN_TRANSITIONS: Record<KitchenTicketStatus, readonly KitchenTicketStatus[]> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['ready', 'cancelled'],
  ready: ['served', 'cancelled'],
  served: [],
  cancelled: [],
}

export interface CreateKitchenTicketInput {
  companyId: string
  locationId: string
  orderId: string
  orderItemId: string
  stationId: string
  userId: string
}

export interface UpdateKitchenTicketStatusInput {
  ticketId: string
  status: KitchenTicketStatus
  userId: string
}

export interface KitchenTicketResult {
  id: string
  companyId: string
  locationId: string
  orderId: string
  orderItemId: string
  stationId: string
  status: KitchenTicketStatus
  priority: number
  createdAt: Date
  updatedAt: Date
}

/** Kitchen ticket CRUD repository — every query runs under {@link withTenant} (RLS backstop). */
export class KitchenTicketRepository {
  /**
   * Creates a kitchen ticket for an order item and station.
   * Validates that orderItemId belongs to the order and station belongs to the location.
   */
  async createTicket(input: CreateKitchenTicketInput): Promise<KitchenTicketResult> {
    return await withTenant(input.companyId, input.locationId, input.userId, async (tx) => {
      // Validate order item belongs to the order and location
      const [item] = await tx
        .select()
        .from(orderItem)
        .where(
          and(
            eq(orderItem.id, input.orderItemId),
            eq(orderItem.orderId, input.orderId),
            eq(orderItem.companyId, input.companyId),
            eq(orderItem.locationId, input.locationId),
          ),
        )
        .limit(1)

      if (!item) {
        sendValidationError('order_item_not_found_or_belongs_to_different_order')
      }

      // Validate station belongs to the location
      const [station] = await tx
        .select()
        .from(kitchenStation)
        .where(
          and(
            eq(kitchenStation.id, input.stationId),
            eq(kitchenStation.companyId, input.companyId),
            eq(kitchenStation.locationId, input.locationId),
            eq(kitchenStation.isActive, true),
          ),
        )
        .limit(1)

      if (!station) {
        sendValidationError('kitchen_station_not_found_or_not_in_location')
      }

      // Create the ticket
      const [ticket] = await tx
        .insert(kitchenTicket)
        .values({
          companyId: input.companyId,
          locationId: input.locationId,
          orderId: input.orderId,
          orderItemId: input.orderItemId,
          stationId: input.stationId,
          status: 'pending',
          priority: 0,
        })
        .returning()

      return ticket!
    })
  }

  /**
   * Updates a kitchen ticket status with conditional update to prevent concurrent transitions.
   */
  async updateStatus(input: UpdateKitchenTicketStatusInput): Promise<KitchenTicketResult> {
    const allowed = KITCHEN_TRANSITIONS[input.status] ?? []

    return await withTenant(null, null, input.userId, async (tx) => {
      // First, get current ticket with lock
      const [current] = await tx
        .select()
        .from(kitchenTicket)
        .where(eq(kitchenTicket.id, input.ticketId))
        .for('update')
        .limit(1)

      if (!current) {
        sendNotFoundError('Kitchen ticket not found')
      }

      // Check if transition is valid
      if (!allowed.includes(current.status)) {
        sendValidationError('invalid_kitchen_ticket_transition')
      }

      // Conditional update: only update if status hasn't changed since we read it
      const [updated] = await tx
        .update(kitchenTicket)
        .set({ status: input.status, updatedAt: new Date() })
        .where(and(eq(kitchenTicket.id, input.ticketId), eq(kitchenTicket.status, current.status)))
        .returning()

      if (!updated) {
        // Ticket status changed between SELECT and UPDATE (concurrent modification)
        sendValidationError('kitchen_ticket_status_changed_concurrently')
      }

      return updated
    })
  }

  /**
   * Gets a single kitchen ticket.
   */
  async getTicket(
    companyId: string,
    userId: string,
    ticketId: string,
  ): Promise<KitchenTicketResult | null> {
    return await withTenant(companyId, null, userId, async (tx) => {
      const [ticket] = await tx
        .select()
        .from(kitchenTicket)
        .where(and(eq(kitchenTicket.id, ticketId), eq(kitchenTicket.companyId, companyId)))
        .limit(1)

      return ticket || null
    })
  }

  /**
   * Lists kitchen tickets for a company/location, optionally filtered by station.
   * Accessible to any member.
   */
  async listTickets(
    companyId: string,
    userId: string,
    locationId?: string,
    stationId?: string,
  ): Promise<KitchenTicketResult[]> {
    return await withTenant(companyId, locationId, userId, async (tx) => {
      const conditions = [eq(kitchenTicket.companyId, companyId)]
      if (locationId) {
        conditions.push(eq(kitchenTicket.locationId, locationId))
      }
      if (stationId) {
        conditions.push(eq(kitchenTicket.stationId, stationId))
      }

      return tx
        .select()
        .from(kitchenTicket)
        .where(and(...conditions))
        .orderBy(kitchenTicket.createdAt)
    })
  }
}

export const kitchenTicketRepository = new KitchenTicketRepository()

import { withTenant } from '~~/server/utils/db/tenant-context'
import { eq, and, desc, sql } from 'drizzle-orm'
import { restaurantTable, kitchenTicket, cashierShift } from '~~/server/utils/schema'
import type {
  RestaurantTableSelect,
  KitchenTicketSelect,
  CashierShiftSelect,
} from '~~/server/utils/schema'

export interface OpenTableInput {
  companyId: string
  locationId: string
  tableId: string
  waiterId?: string
  coverCount?: number
  userId: string
}

export interface CloseTableInput {
  companyId: string
  locationId: string
  tableId: string
  userId: string
}

export interface CreateKitchenTicketInput {
  companyId: string
  locationId: string
  orderId: string
  items: Array<{
    productId?: string
    productName: string
    quantity: string
    notes?: string
    urgent?: boolean
  }>
  userId: string
}

export interface UpdateKitchenTicketStatusInput {
  companyId: string
  locationId: string
  ticketId: string
  status: 'pending' | 'in_progress' | 'ready' | 'served' | 'cancelled'
  userId: string
}

export interface OpenCashierShiftInput {
  companyId: string
  locationId: string
  userId: string
  openingFloat: string
}

export interface CloseCashierShiftInput {
  companyId: string
  locationId: string
  shiftId: string
  userId: string
  closingFloat: string
  expectedAmount: string
  actualAmount: string
  notes?: string
}

export const restaurantRepository = {
  // Restaurant Table operations
  async openTable(input: OpenTableInput): Promise<RestaurantTableSelect> {
    return withTenant(input.companyId, input.locationId, input.userId, async (tx) => {
      const table = await tx.query.restaurantTable.findFirst({
        where: and(
          eq(restaurantTable.companyId, input.companyId),
          eq(restaurantTable.locationId, input.locationId),
          eq(restaurantTable.id, input.tableId),
        ),
      })

      if (!table) {
        throw new Error('Table not found')
      }
      if (table.status !== 'available') {
        throw new Error(`Table is not available (current status: ${table.status})`)
      }

      const [updated] = await tx
        .update(restaurantTable)
        .set({
          status: 'occupied',
          currentOrderId: null, // Will be set when order is created
          updatedAt: new Date(),
        })
        .where(eq(restaurantTable.id, input.tableId))
        .returning()

      if (!updated) {
        throw new Error('Table not updated')
      }

      return updated
    })
  },

  async closeTable(input: CloseTableInput): Promise<RestaurantTableSelect> {
    return withTenant(input.companyId, input.locationId, input.userId, async (tx) => {
      const table = await tx.query.restaurantTable.findFirst({
        where: and(
          eq(restaurantTable.companyId, input.companyId),
          eq(restaurantTable.locationId, input.locationId),
          eq(restaurantTable.id, input.tableId),
        ),
      })

      if (!table) {
        throw new Error('Table not found')
      }
      if (table.status !== 'occupied') {
        throw new Error(`Table is not occupied (current status: ${table.status})`)
      }

      const [updated] = await tx
        .update(restaurantTable)
        .set({
          status: 'available',
          currentOrderId: null,
          updatedAt: new Date(),
        })
        .where(eq(restaurantTable.id, input.tableId))
        .returning()

      if (!updated) {
        throw new Error('Table not updated')
      }

      return updated
    })
  },

  async getTable(
    companyId: string,
    locationId: string,
    tableId: string,
  ): Promise<RestaurantTableSelect | null> {
    return withTenant(companyId, locationId, null, async (tx) => {
      const table = await tx.query.restaurantTable.findFirst({
        where: and(
          eq(restaurantTable.companyId, companyId),
          eq(restaurantTable.locationId, locationId),
          eq(restaurantTable.id, tableId),
        ),
      })
      return table ?? null
    })
  },

  async listTables(companyId: string, locationId: string): Promise<RestaurantTableSelect[]> {
    return withTenant(companyId, locationId, null, async (tx) => {
      return tx.query.restaurantTable.findMany({
        where: and(
          eq(restaurantTable.companyId, companyId),
          eq(restaurantTable.locationId, locationId),
        ),
        orderBy: [restaurantTable.number],
      })
    })
  },

  // Kitchen Ticket operations
  async createKitchenTicket(input: CreateKitchenTicketInput): Promise<KitchenTicketSelect> {
    return withTenant(input.companyId, input.locationId, input.userId, async (tx) => {
      const [ticket] = await tx
        .insert(kitchenTicket)
        .values({
          companyId: input.companyId,
          locationId: input.locationId,
          orderId: input.orderId,
          status: 'pending',
          // shortcut: kitchen_ticket não tem coluna `items` (o Drizzle descartava a chave) e
          // exige os dois FKs; `default` mantém o SQL atual — o INSERT falha em NOT NULL
          // até o input passar orderItemId/stationId.
          orderItemId: sql`default`,
          stationId: sql`default`,
        })
        .returning()

      if (!ticket) {
        throw new Error('Kitchen ticket not created')
      }

      return ticket
    })
  },

  async updateKitchenTicketStatus(
    input: UpdateKitchenTicketStatusInput,
  ): Promise<KitchenTicketSelect | null> {
    return withTenant(input.companyId, input.locationId, input.userId, async (tx) => {
      const [ticket] = await tx
        .update(kitchenTicket)
        .set({ status: input.status, updatedAt: new Date() })
        .where(
          and(eq(kitchenTicket.companyId, input.companyId), eq(kitchenTicket.id, input.ticketId)),
        )
        .returning()

      return ticket || null
    })
  },

  async getKitchenTicket(
    companyId: string,
    locationId: string,
    ticketId: string,
  ): Promise<KitchenTicketSelect | null> {
    return withTenant(companyId, locationId, null, async (tx) => {
      const ticket = await tx.query.kitchenTicket.findFirst({
        where: and(eq(kitchenTicket.companyId, companyId), eq(kitchenTicket.id, ticketId)),
      })
      return ticket ?? null
    })
  },

  async listKitchenTickets(
    companyId: string,
    locationId: string,
    opts?: { status?: string; limit?: number; offset?: number },
  ): Promise<KitchenTicketSelect[]> {
    return withTenant(companyId, locationId, null, async (tx) => {
      const conditions = [
        eq(kitchenTicket.companyId, companyId),
        eq(kitchenTicket.locationId, locationId),
      ]
      if (opts?.status) conditions.push(eq(kitchenTicket.status, opts.status))

      return tx.query.kitchenTicket.findMany({
        where: and(...conditions),
        orderBy: [desc(kitchenTicket.createdAt)],
        limit: opts?.limit || 50,
        offset: opts?.offset || 0,
      })
    })
  },

  // Cashier Shift operations
  async openCashierShift(input: OpenCashierShiftInput): Promise<CashierShiftSelect> {
    return withTenant(input.companyId, input.locationId, input.userId, async (tx) => {
      // Check if user already has an open shift
      const existing = await tx.query.cashierShift.findFirst({
        where: and(
          eq(cashierShift.companyId, input.companyId),
          eq(cashierShift.userId, input.userId),
          eq(cashierShift.status, 'open'),
        ),
      })

      if (existing) {
        throw new Error('User already has an open shift')
      }

      const [shift] = await tx
        .insert(cashierShift)
        .values({
          companyId: input.companyId,
          locationId: input.locationId,
          userId: input.userId,
          openingFloat: input.openingFloat,
          status: 'open',
        })
        .returning()

      if (!shift) {
        throw new Error('Cashier shift not created')
      }

      return shift
    })
  },

  async closeCashierShift(input: CloseCashierShiftInput): Promise<CashierShiftSelect> {
    return withTenant(input.companyId, input.locationId, input.userId, async (tx) => {
      const shift = await tx.query.cashierShift.findFirst({
        where: and(eq(cashierShift.companyId, input.companyId), eq(cashierShift.id, input.shiftId)),
      })

      if (!shift) {
        throw new Error('Shift not found')
      }
      if (shift.status !== 'open') {
        throw new Error(`Shift is not open (current status: ${shift.status})`)
      }

      const _closingFloat = Number(input.closingFloat)
      const expectedAmount = Number(input.expectedAmount)
      const actualAmount = Number(input.actualAmount)
      const difference = actualAmount - expectedAmount

      const [updated] = await tx
        .update(cashierShift)
        .set({
          status: difference === 0 ? 'reconciled' : 'closed',
          closedAt: new Date(),
          closingFloat: input.closingFloat,
          expectedAmount: input.expectedAmount,
          actualAmount: input.actualAmount,
          difference: difference.toFixed(2),
          notes: input.notes,
          updatedAt: new Date(),
        })
        .where(eq(cashierShift.id, input.shiftId))
        .returning()

      if (!updated) {
        throw new Error('Cashier shift not updated')
      }

      return updated
    })
  },

  async getCashierShift(
    companyId: string,
    locationId: string,
    shiftId: string,
  ): Promise<CashierShiftSelect | null> {
    return withTenant(companyId, locationId, null, async (tx) => {
      const shift = await tx.query.cashierShift.findFirst({
        where: and(eq(cashierShift.companyId, companyId), eq(cashierShift.id, shiftId)),
      })
      return shift ?? null
    })
  },

  async listCashierShifts(
    companyId: string,
    locationId: string,
    opts?: { status?: string; userId?: string; limit?: number; offset?: number },
  ): Promise<CashierShiftSelect[]> {
    return withTenant(companyId, locationId, null, async (tx) => {
      const conditions = [
        eq(cashierShift.companyId, companyId),
        eq(cashierShift.locationId, locationId),
      ]
      if (opts?.status) conditions.push(eq(cashierShift.status, opts.status))
      if (opts?.userId) conditions.push(eq(cashierShift.userId, opts.userId))

      return tx.query.cashierShift.findMany({
        where: and(...conditions),
        orderBy: [desc(cashierShift.openedAt)],
        limit: opts?.limit || 50,
        offset: opts?.offset || 0,
      })
    })
  },

  async getCurrentUserShift(
    companyId: string,
    locationId: string,
    userId: string,
  ): Promise<CashierShiftSelect | null> {
    return withTenant(companyId, locationId, userId, async (tx) => {
      const shift = await tx.query.cashierShift.findFirst({
        where: and(
          eq(cashierShift.companyId, companyId),
          eq(cashierShift.userId, userId),
          eq(cashierShift.status, 'open'),
        ),
      })
      return shift ?? null
    })
  },
}

export type RestaurantRepository = typeof restaurantRepository

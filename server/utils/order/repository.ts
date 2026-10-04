import { withTenant } from '../db/tenant-context'
import type { Tx } from '../db'
import { eq, and, desc } from 'drizzle-orm'
import { order, orderItem, orderDineIn, orderTakeout } from '../schema'
import type { OrderSelect, OrderItemSelect } from '../schema'

const _VALID_STATUSES = ['open', 'completed', 'cancelled'] as const
const _VALID_ORDER_TYPES = ['dine_in', 'takeout'] as const

type OrderStatus = (typeof _VALID_STATUSES)[number]
type OrderType = (typeof _VALID_ORDER_TYPES)[number]

interface CreateOrderInput {
  companyId: string
  locationId: string
  orderType: OrderType
  customerId?: string
  partyId?: string
  createdBy: string
  idempotencyKey?: string
  items: Array<{
    productId?: string
    productName: string
    unitPrice: string
    quantity: string
    taxSnapshot: string
    bomSnapshot: string
    discountApplied?: string
  }>
  dineIn?: {
    tableId: string
    coverCount?: number
    waiterId?: string
  }
  takeout?: {
    pickupAt?: Date
    pickupName?: string
    pickupPhone?: string
  }
}

interface OrderWithItems extends OrderSelect {
  items: OrderItemSelect[]
  dineIn?: { tableId: string; coverCount: number; waiterId: string | null; openedAt: Date }
  takeout?: { pickupAt: Date | null; pickupName: string | null; pickupPhone: string | null }
}

async function enrichOrder(tx: Tx, orderRow: OrderSelect): Promise<OrderWithItems | null> {
  if (!orderRow) return null

  const items = await tx.query.orderItem.findMany({
    where: eq(orderItem.orderId, orderRow.id),
  })

  let dineIn: OrderWithItems['dineIn'] = undefined
  let takeout: OrderWithItems['takeout'] = undefined

  if (orderRow.orderType === 'dine_in') {
    const di = await tx.query.orderDineIn.findFirst({
      where: eq(orderDineIn.orderId, orderRow.id),
    })
    if (di)
      dineIn = {
        tableId: di.tableId,
        coverCount: di.coverCount,
        waiterId: di.waiterId,
        openedAt: di.openedAt,
      }
  } else if (orderRow.orderType === 'takeout') {
    const to = await tx.query.orderTakeout.findFirst({
      where: eq(orderTakeout.orderId, orderRow.id),
    })
    if (to)
      takeout = { pickupAt: to.pickupAt, pickupName: to.pickupName, pickupPhone: to.pickupPhone }
  }

  return {
    ...orderRow,
    items: items || [],
    dineIn,
    takeout,
  }
}

export const orderRepository = {
  async create(input: CreateOrderInput): Promise<OrderWithItems> {
    return withTenant(input.companyId, input.locationId, input.createdBy, async (tx) => {
      if (input.idempotencyKey) {
        const existing = await tx.query.order.findFirst({
          where: and(
            eq(order.companyId, input.companyId),
            eq(order.idempotencyKey, input.idempotencyKey),
          ),
        })
        if (existing) {
          return this.getById(input.companyId, existing.id) as Promise<OrderWithItems>
        }
      }

      const [newOrder] = await tx
        .insert(order)
        .values({
          companyId: input.companyId,
          locationId: input.locationId,
          orderType: input.orderType,
          status: 'open',
          customerId: input.customerId,
          partyId: input.partyId,
          createdBy: input.createdBy,
          idempotencyKey: input.idempotencyKey,
          totalAmount: '0',
        })
        .returning()

      let totalAmount = 0
      const itemRows = input.items.map((item, _index) => {
        const unitPrice = Number(item.unitPrice)
        const quantity = Number(item.quantity)
        const discount = Number(item.discountApplied || '0')
        const lineTotal = Math.round((unitPrice * quantity - discount) * 100) / 100
        totalAmount += lineTotal

        return {
          companyId: input.companyId,
          locationId: input.locationId,
          orderId: newOrder.id,
          productId: item.productId,
          productName: item.productName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          taxSnapshot: item.taxSnapshot,
          bomSnapshot: item.bomSnapshot,
          discountApplied: item.discountApplied || '0',
        }
      })

      if (itemRows.length > 0) {
        await tx.insert(orderItem).values(itemRows)
      }

      await tx
        .update(order)
        .set({ totalAmount: totalAmount.toFixed(2) })
        .where(eq(order.id, newOrder.id))

      if (input.orderType === 'dine_in' && input.dineIn) {
        await tx.insert(orderDineIn).values({
          orderId: newOrder.id,
          tableId: input.dineIn.tableId,
          coverCount: input.dineIn.coverCount || 1,
          waiterId: input.dineIn.waiterId,
        })
      } else if (input.orderType === 'takeout' && input.takeout) {
        await tx.insert(orderTakeout).values({
          orderId: newOrder.id,
          pickupAt: input.takeout.pickupAt,
          pickupName: input.takeout.pickupName,
          pickupPhone: input.takeout.pickupPhone,
        })
      }

      const result = await this.getById(input.companyId, newOrder.id, tx)
      if (!result) throw new Error('Order not found after creation')
      return result
    })
  },

  async getById(
    companyId: string,
    orderId: string,
    existingTx?: Tx,
  ): Promise<OrderWithItems | null> {
    if (existingTx) {
      const orderRow = await existingTx.query.order.findFirst({
        where: and(eq(order.companyId, companyId), eq(order.id, orderId)),
      })
      return enrichOrder(existingTx, orderRow)
    }
    return withTenant(companyId, null, null, async (tx) => {
      const orderRow = await tx.query.order.findFirst({
        where: and(eq(order.companyId, companyId), eq(order.id, orderId)),
      })
      return enrichOrder(tx, orderRow)
    })
  },

  async complete(companyId: string, orderId: string): Promise<OrderWithItems | null> {
    return withTenant(companyId, null, null, async (tx) => {
      const current = await tx.query.order.findFirst({
        where: and(eq(order.companyId, companyId), eq(order.id, orderId)),
      })
      if (!current) {
        throw new Error('Order not found')
      }
      if (current.status !== 'open') {
        throw new Error(`Cannot complete order with status ${current.status}`)
      }

      await tx
        .update(order)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(order.id, orderId))

      return this.getById(companyId, orderId, tx)
    })
  },

  async cancel(companyId: string, orderId: string): Promise<OrderWithItems | null> {
    return withTenant(companyId, null, null, async (tx) => {
      const current = await tx.query.order.findFirst({
        where: and(eq(order.companyId, companyId), eq(order.id, orderId)),
      })
      if (!current) {
        throw new Error('Order not found')
      }
      if (current.status !== 'open') {
        throw new Error(`Cannot cancel order with status ${current.status}`)
      }

      await tx
        .update(order)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(order.id, orderId))

      return this.getById(companyId, orderId, tx)
    })
  },

  async list(
    companyId: string,
    opts?: { status?: OrderStatus; limit?: number; offset?: number },
  ): Promise<OrderWithItems[]> {
    return withTenant(companyId, null, null, async (tx) => {
      const conditions = [eq(order.companyId, companyId)]
      if (opts?.status) conditions.push(eq(order.status, opts.status))

      const rows = await tx.query.order.findMany({
        where: and(...conditions),
        orderBy: [desc(order.createdAt)],
        limit: opts?.limit || 50,
        offset: opts?.offset || 0,
      })

      const results: OrderWithItems[] = []
      for (const row of rows) {
        const enriched = await enrichOrder(tx, row)
        if (enriched) results.push(enriched)
      }
      return results
    })
  },
}

export type OrderRepository = typeof orderRepository

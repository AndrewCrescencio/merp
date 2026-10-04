import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core'
import { company } from './company'
import { location } from './location'
import { order } from './order'
import { orderItem } from './order-item'
import { kitchenStation } from './kitchen-station'

export const kitchenTicket = pgTable(
  'kitchen_ticket',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: text('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => location.id, { onDelete: 'cascade' }),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    orderItemId: text('order_item_id')
      .notNull()
      .references(() => orderItem.id, { onDelete: 'cascade' }),
    stationId: text('station_id')
      .notNull()
      .references(() => kitchenStation.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'), // 'pending', 'preparing', 'ready', 'delivered'
    priority: integer('priority').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('kitchen_ticket_company_id_idx').on(table.companyId),
    index('kitchen_ticket_location_id_idx').on(table.locationId),
    index('kitchen_ticket_order_id_idx').on(table.orderId),
    index('kitchen_ticket_station_id_idx').on(table.stationId),
    index('kitchen_ticket_status_idx').on(table.status),
  ],
)

export type KitchenTicketInsert = typeof kitchenTicket.$inferInsert
export type KitchenTicketSelect = typeof kitchenTicket.$inferSelect

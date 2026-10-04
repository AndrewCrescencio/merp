import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { company } from './company'
import { location } from './location'

export const restaurantTable = pgTable(
  'restaurant_table',
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
    number: integer('number').notNull(),
    name: text('name'),
    capacity: integer('capacity').notNull().default(4),
    status: text('status').notNull().default('available'), // 'available', 'occupied', 'reserved', 'closed'
    currentOrderId: text('current_order_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('restaurant_table_company_id_idx').on(table.companyId),
    index('restaurant_table_location_id_idx').on(table.locationId),
    index('restaurant_table_status_idx').on(table.status),
    uniqueIndex('restaurant_table_company_number_idx').on(table.companyId, table.number),
  ],
)

export type RestaurantTableInsert = typeof restaurantTable.$inferInsert
export type RestaurantTableSelect = typeof restaurantTable.$inferSelect

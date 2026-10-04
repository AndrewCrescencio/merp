import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core'
import { company } from './company'
import { location } from './location'

export const kitchenStation = pgTable(
  'kitchen_station',
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
    name: text('name').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('kitchen_station_company_id_idx').on(table.companyId),
    index('kitchen_station_location_id_idx').on(table.locationId),
    index('kitchen_station_is_active_idx').on(table.isActive),
  ],
)

export type KitchenStationInsert = typeof kitchenStation.$inferInsert
export type KitchenStationSelect = typeof kitchenStation.$inferSelect

import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core'
import { company } from './company'
import { location } from './location'

export const printer = pgTable(
  'printer',
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
    driver: text('driver').notNull(), // 'escpos', 'star', 'custom'
    connection: jsonb('connection').notNull(), // { type: 'tcp', host: '', port: 9100 } etc
    stationIds: jsonb('station_ids').notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('printer_company_id_idx').on(table.companyId),
    index('printer_location_id_idx').on(table.locationId),
    index('printer_is_active_idx').on(table.isActive),
  ],
)

export type PrinterInsert = typeof printer.$inferInsert
export type PrinterSelect = typeof printer.$inferSelect

import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core'
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
    type: text('type').notNull(), // 'receipt', 'kitchen', 'label'
    connectionType: text('connection_type').notNull(), // 'network', 'usb', 'bluetooth'
    connectionConfig: text('connection_config').notNull(), // JSON string
    isDefault: boolean('is_default').notNull().default(false),
    status: text('status').notNull().default('online'), // 'online', 'offline', 'error'
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('printer_company_id_idx').on(table.companyId),
    index('printer_location_id_idx').on(table.locationId),
    index('printer_type_idx').on(table.type),
    index('printer_status_idx').on(table.status),
  ],
)

export type PrinterInsert = typeof printer.$inferInsert
export type PrinterSelect = typeof printer.$inferSelect

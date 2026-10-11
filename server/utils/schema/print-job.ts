import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core'
import { company } from './company'
import { location } from './location'
import { printer } from './printer'
import { order } from './order'

export const printJob = pgTable(
  'print_job',
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
    printerId: text('printer_id')
      .notNull()
      .references(() => printer.id, { onDelete: 'cascade' }),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    template: text('template').notNull(),
    payload: text('payload').notNull(), // JSON string
    priority: integer('priority').notNull().default(0),
    status: text('status').notNull().default('pending'), // 'pending', 'printing', 'completed', 'failed'
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('print_job_company_id_idx').on(table.companyId),
    index('print_job_location_id_idx').on(table.locationId),
    index('print_job_printer_id_idx').on(table.printerId),
    index('print_job_order_id_idx').on(table.orderId),
    index('print_job_status_idx').on(table.status),
    index('print_job_priority_created_idx').on(table.priority, table.createdAt),
  ],
)

export type PrintJobInsert = typeof printJob.$inferInsert
export type PrintJobSelect = typeof printJob.$inferSelect

import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core'
import { company } from './company'
import { location } from './location'
import { printer } from './printer'
import { kitchenTicket } from './kitchen-ticket'

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
    kitchenTicketId: text('kitchen_ticket_id').references(() => kitchenTicket.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),
    status: text('status').notNull().default('pending'), // 'pending', 'printing', 'printed', 'failed'
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    printedAt: timestamp('printed_at', { withTimezone: true }),
  },
  (table) => [
    index('print_job_company_id_idx').on(table.companyId),
    index('print_job_location_id_idx').on(table.locationId),
    index('print_job_printer_id_idx').on(table.printerId),
    index('print_job_status_idx').on(table.status),
  ],
)

export type PrintJobInsert = typeof printJob.$inferInsert
export type PrintJobSelect = typeof printJob.$inferSelect

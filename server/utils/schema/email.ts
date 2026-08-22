import { pgTable, text, timestamp, integer, index, jsonb } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const emailQueue = pgTable(
  'email_queue',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    to: text('to').notNull(),
    subject: text('subject').notNull(),
    html: text('html').notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    status: text('status').notNull().default('pending'), // pending, sent, failed
    lastError: text('last_error'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('email_queue_status_idx').on(table.status),
    index('email_queue_scheduled_at_idx').on(table.scheduledAt),
  ],
)

export type EmailQueueInsert = typeof emailQueue.$inferInsert
export type EmailQueueSelect = typeof emailQueue.$inferSelect

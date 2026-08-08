import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { company } from './company'
import { user } from './identity'

export const invite = pgTable(
  'invite',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: text('company_id')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('invite_company_email_idx').on(table.companyId, table.email),
    index('invite_pending_email_idx')
      .on(table.email)
      .where(sql`${table.acceptedAt} IS NULL`),
  ],
)

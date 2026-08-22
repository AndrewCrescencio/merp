import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { user } from './identity'

export const twoFactor = pgTable(
  'two_factor',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('two_factor_user_id_idx').on(table.userId)],
)

export type TwoFactorInsert = typeof twoFactor.$inferInsert
export type TwoFactorSelect = typeof twoFactor.$inferSelect

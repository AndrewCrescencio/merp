import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core'

export const authSecurityState = pgTable(
  'auth_security_state',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    resetAt: timestamp('reset_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auth_security_state_reset_at_idx').on(table.resetAt)],
)

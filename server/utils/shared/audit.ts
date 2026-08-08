import { db } from '../db'
import { authEvent } from '../schema'
import { handleDatabaseError } from './errors'

export interface CreateAuthEventInput {
  userId?: string | null
  email: string
  eventType: string
  ipAddress?: string | null
  metadata?: Record<string, unknown> | null
}

export async function createAuthEvent(input: CreateAuthEventInput): Promise<void> {
  try {
    await db.insert(authEvent).values({
      userId: input.userId || null,
      email: input.email,
      eventType: input.eventType,
      ipAddress: input.ipAddress || null,
      metadata: (input.metadata as Record<string, unknown>) || null,
    })
  } catch (error) {
    return handleDatabaseError(error)
  }
}

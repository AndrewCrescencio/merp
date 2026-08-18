import { db } from '../db'
import { authEvent } from '../schema'
import { logger } from '#shared/logger'

export interface CreateAuthEventInput {
  userId?: string | null
  email: string
  eventType: string
  ipAddress?: string | null
  metadata?: Record<string, unknown> | null
}

// FR-023: a auditoria NUNCA falha nem bloqueia a requisição (raiz do padrão
// fire-and-forget espalhado pelos handlers) — falha de insert vira warn, e
// mutações já cometidas (register, logout, deactivate, invite, etc.) não
// devolvem 503 espúrio com efeito persistido. Callers que usam `.catch()`
// (middleware, repositórios) seguem inalterados — o catch vira no-op.
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
    logger.warn('Failed to record auth event', {
      eventType: input.eventType,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

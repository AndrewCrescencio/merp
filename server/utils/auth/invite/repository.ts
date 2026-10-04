import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { db } from '../../db'
import { companyMember, invite } from '../../schema'
import { H3Error } from 'h3'
import {
  handleDatabaseError,
  sendConflictError,
  sendNotFoundError,
  isPgConflict,
} from '../../shared/errors'
import { withTenant } from '../../db/tenant-context'

export interface CreateInviteInput {
  companyId: string
  email: string
  invitedBy: string
}

export interface InviteResult {
  id: string
  companyId: string
  email: string
  invitedBy: string
  acceptedAt: Date | null
  expiresAt: Date
  createdAt: Date
}

export interface CreatedInviteResult extends InviteResult {
  token: string
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// AUD-01: token de aceite com 256 bits de entropia; no banco só o hash
// SHA-256 (dump da base não vaza tokens utilizáveis).
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

// Nunca devolver tokenHash para fora do módulo — é segredo de auditoria.
type Row = typeof invite.$inferSelect
function toInviteResult(row: Row): InviteResult {
  const { tokenHash: _tokenHash, ...rest } = row
  return rest
}

/** Invite repository — tokens carry 256-bit entropy; only the SHA-256 hash is stored. */
export class InviteRepository {
  /**
   * Creates an invite (7d TTL). Returns the accept token exactly once —
   * callers must not persist or re-expose it. 409 when an invite for the
   * company already exists.
   */
  async createInvite(input: CreateInviteInput): Promise<CreatedInviteResult> {
    try {
      return await withTenant(input.companyId, null, input.invitedBy, async (tx) => {
        const { token, tokenHash } = generateToken()
        const [created] = await tx
          .insert(invite)
          .values({
            companyId: input.companyId,
            email: input.email,
            invitedBy: input.invitedBy,
            tokenHash,
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          })
          .returning()
        return { ...toInviteResult(created!), token }
      })
    } catch (error: unknown) {
      if (isPgConflict(error)) {
        sendConflictError('Invite already exists for this company')
      }
      return handleDatabaseError(error)
    }
  }

  /** Finds a non-expired, unaccepted invite for (company, email), or null. */
  async findPendingInvite(companyId: string, email: string): Promise<InviteResult | null> {
    try {
      return await withTenant(companyId, null, null, async (tx) => {
        const [found] = await tx
          .select()
          .from(invite)
          .where(
            and(
              eq(invite.companyId, companyId),
              eq(invite.email, email),
              isNull(invite.acceptedAt),
              gt(invite.expiresAt, new Date()),
            ),
          )
          .limit(1)
        return found ? toInviteResult(found) : null
      })
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  /** Lists a company's invites as metadata (never tokens). */
  async listCompanyInvites(companyId: string): Promise<InviteResult[]> {
    try {
      return await withTenant(companyId, null, null, async (tx) => {
        return (await tx.select().from(invite).where(eq(invite.companyId, companyId))).map(
          toInviteResult,
        )
      })
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  // AUD-01: aceite por token de uso único. O lookup e o claim rodam com o GUC
  // app.invite_token_hash setado na transação — o SELECT passa pela policy de
  // token e o INSERT de member pelo backstop cm_insert_policy (que valida o
  // hash + email da sessão no banco). Token reutilizado ou expirado → 404
  // genérico; membro já existente → 409 (rollback, token não é consumido).
  /**
   * Claims an invite by secret token and creates the membership as `member`.
   * Single-use and race-safe (conditional claim UPDATE). 404 for
   * invalid/expired/consumed tokens or email mismatch; 409 when the user is
   * already a member (token is NOT consumed on 409).
   */
  async acceptInvite(token: string, email: string, userId: string): Promise<InviteResult> {
    try {
      const tokenHash = hashToken(token)

      return await db.transaction(async (tx) => {
        const pending = await withTenant(
          null,
          null,
          userId,
          async (t) => {
            await t.execute(sql`SELECT set_config('app.invite_token_hash', ${tokenHash}, true)`)
            const [found] = await t
              .select()
              .from(invite)
              .where(
                and(
                  eq(invite.tokenHash, tokenHash),
                  eq(invite.email, email),
                  isNull(invite.acceptedAt),
                  gt(invite.expiresAt, new Date()),
                ),
              )
              .limit(1)
            return found || null
          },
          tx,
        )

        if (!pending) {
          sendNotFoundError('Invite not found or expired')
        }

        return withTenant(
          pending!.companyId,
          null,
          userId,
          async (t) => {
            await t.execute(sql`SELECT set_config('app.invite_token_hash', ${tokenHash}, true)`)

            const [claimed] = await t
              .update(invite)
              .set({ acceptedAt: new Date() })
              .where(
                and(
                  eq(invite.id, pending!.id),
                  isNull(invite.acceptedAt),
                  gt(invite.expiresAt, new Date()),
                ),
              )
              .returning()

            if (!claimed) {
              // claim perdido (uso concorrente) ou expirado entre o SELECT e o UPDATE
              sendNotFoundError('Invite not found or expired')
            }

            await t
              .insert(companyMember)
              .values({ companyId: pending!.companyId, userId, role: 'member' })

            return toInviteResult(claimed!)
          },
          tx,
        )
      })
    } catch (error: unknown) {
      if (isPgConflict(error)) {
        sendConflictError('User is already a member of this company')
      }
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }
}

export const inviteRepository = new InviteRepository()

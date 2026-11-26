import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { companyMember, invite } from '../../schema'
import { H3Error } from 'h3'
import {
  handleDatabaseError,
  sendConflictError,
  sendNotFoundError,
  isPgConflict,
} from '../../shared/errors'
import { withTenant, type TenantTransaction } from '../../db/tenant-context'

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

// token de aceite com 256 bits de entropia; no banco só o hash
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
  async createInvite(
    input: CreateInviteInput,
    transaction?: TenantTransaction,
  ): Promise<CreatedInviteResult> {
    try {
      const operation = async (tx: TenantTransaction): Promise<CreatedInviteResult> => {
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
      }
      const context = { companyId: input.companyId, locationId: null, userId: input.invitedBy }
      return transaction
        ? await withTenant(context, operation, { transaction })
        : await withTenant(context, operation)
    } catch (error: unknown) {
      if (isPgConflict(error)) {
        sendConflictError('Invite already exists for this company')
      }
      return handleDatabaseError(error)
    }
  }

  /** Finds a non-expired, unaccepted invite for (company, email), or null. */
  async findPendingInvite(
    companyId: string,
    email: string,
    transaction?: TenantTransaction,
  ): Promise<InviteResult | null> {
    try {
      const operation = async (tx: TenantTransaction): Promise<InviteResult | null> => {
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
      }
      const context = { companyId, locationId: null, userId: null }
      return transaction
        ? await withTenant(context, operation, { transaction })
        : await withTenant(context, operation)
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  /** Lists a company's invites as metadata (never tokens). */
  async listCompanyInvites(
    companyId: string,
    transaction?: TenantTransaction,
  ): Promise<InviteResult[]> {
    try {
      const operation = async (tx: TenantTransaction): Promise<InviteResult[]> => {
        return (await tx.select().from(invite).where(eq(invite.companyId, companyId))).map(
          toInviteResult,
        )
      }
      const context = { companyId, locationId: null, userId: null }
      return transaction
        ? await withTenant(context, operation, { transaction })
        : await withTenant(context, operation)
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  // aceite por token de uso único. O lookup e o claim rodam com o GUC
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

      // This use case owns the transaction because invite claim + membership
      // insertion are one atomic, single-use operation.
      return await withTenant({ companyId: null, locationId: null, userId }, async (tx) => {
        // Pre-company scope can read the invite by the one-use token marker.
        await tx.execute(sql`SELECT set_config('app.invite_token_hash', ${tokenHash}, true)`)
        const [pending] = await tx
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

        if (!pending) {
          sendNotFoundError('Invite not found or expired')
        }

        // Explicit pre-company -> invite-company transition. The token marker
        // and the new scope remain local to this acceptance transaction.
        return await withTenant(
          { companyId: pending!.companyId, locationId: null, userId },
          async (t) => {
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
          { transaction: tx, scope: 'transition' },
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

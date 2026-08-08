import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../../db'
import { companyMember, invite } from '../../schema'
import { H3Error } from 'h3'
import {
  handleDatabaseError,
  sendConflictError,
  sendNotFoundError,
  getPostgresErrorCode,
} from '../../shared/errors'
import { withTenant } from '../tenant-context'

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

export interface IInviteRepository {
  createInvite(input: CreateInviteInput): Promise<InviteResult>
  findPendingInvite(companyId: string, email: string): Promise<InviteResult | null>
  listCompanyInvites(companyId: string): Promise<InviteResult[]>
  acceptInvite(companyId: string, email: string, userId: string): Promise<InviteResult>
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export class InviteRepository implements IInviteRepository {
  async createInvite(input: CreateInviteInput): Promise<InviteResult> {
    try {
      return await withTenant(input.companyId, input.invitedBy, async (tx) => {
        const [created] = await tx
          .insert(invite)
          .values({
            companyId: input.companyId,
            email: input.email,
            invitedBy: input.invitedBy,
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          })
          .returning()
        return created!
      })
    } catch (error: any) {
      if (getPostgresErrorCode(error) === '23505') {
        sendConflictError('Invite already exists for this company')
      }
      return handleDatabaseError(error)
    }
  }

  async findPendingInvite(companyId: string, email: string): Promise<InviteResult | null> {
    try {
      return await withTenant(companyId, null, async (tx) => {
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
        return found || null
      })
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async listCompanyInvites(companyId: string): Promise<InviteResult[]> {
    try {
      return await withTenant(companyId, null, async (tx) => {
        return await tx.select().from(invite).where(eq(invite.companyId, companyId))
      })
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async acceptInvite(companyId: string, email: string, userId: string): Promise<InviteResult> {
    try {
      return await withTenant(companyId, userId, async (tx) => {
        const [pending] = await tx
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

        if (!pending) {
          sendNotFoundError('Invite not found or expired')
        }

        await tx.insert(companyMember).values({ companyId, userId, role: 'member' })

        const [accepted] = await tx
          .update(invite)
          .set({ acceptedAt: new Date() })
          .where(eq(invite.id, pending!.id))
          .returning()

        return accepted!
      })
    } catch (error: any) {
      if (getPostgresErrorCode(error) === '23505') {
        sendConflictError('User is already a member of this company')
      }
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }
}

export const inviteRepository: IInviteRepository = new InviteRepository()

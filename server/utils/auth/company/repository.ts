import { and, eq, like, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import { company, companyMember, session } from '../../schema'
import { createError, H3Error } from 'h3'
import {
  handleDatabaseError,
  sendConflictError,
  sendNotFoundError,
  getPostgresErrorCode,
} from '../../shared/errors'
import { withTenant } from '../tenant-context'

export function escapeLikePattern(query: string): string {
  return query.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export interface CreateCompanyInput {
  name: string
  cnpj?: string
  razaoSocial?: string
}

export interface CompanyResult {
  id: string
  name: string
  cnpj: string | null
  razaoSocial: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CompanyMemberResult {
  id: string
  companyId: string
  userId: string
  role: string
  createdAt: Date
}

export interface ICompanyRepository {
  createCompany(input: CreateCompanyInput): Promise<CompanyResult>
  createCompanyWithOwner(data: CreateCompanyInput, ownerUserId: string): Promise<CompanyResult>
  createCompanyMember(
    companyId: string,
    userId: string,
    role?: string,
  ): Promise<CompanyMemberResult>
  searchCompanies(query: string, userId: string): Promise<CompanyResult[]>
  findCompanyById(id: string): Promise<CompanyResult | null>
  findUserCompanies(userId: string): Promise<Array<CompanyResult & { role: string }>>
  isCompanyMember(userId: string, companyId: string): Promise<boolean>
  getCompanyMembershipRole(userId: string, companyId: string): Promise<string | null>
  removeCompanyMember(
    companyId: string,
    executedByUserId: string,
    targetUserId: string,
  ): Promise<void>
  setActiveCompany(sessionId: string, companyId: string | null): Promise<void>
  getActiveCompany(sessionId: string): Promise<string | null>
  softDeleteCompany(companyId: string, userId: string): Promise<CompanyResult>
  updateCompany(
    companyId: string,
    userId: string,
    input: Partial<CreateCompanyInput>,
  ): Promise<CompanyResult>
}

export class CompanyRepository implements ICompanyRepository {
  async createCompany(input: CreateCompanyInput): Promise<CompanyResult> {
    try {
      const [created] = await db
        .insert(company)
        .values({
          name: input.name,
          cnpj: input.cnpj || null,
          razaoSocial: input.razaoSocial || null,
        })
        .returning()

      return created!
    } catch (error: any) {
      if (error?.code === '23505') {
        throw createError({
          status: 409,
          statusText: '409',
          message: JSON.stringify({
            error: 'conflict',
            message: 'CNPJ already registered',
          }),
        })
      }
      return handleDatabaseError(error)
    }
  }

  async createCompanyWithOwner(
    data: CreateCompanyInput,
    ownerUserId: string,
  ): Promise<CompanyResult> {
    try {
      return await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(company)
          .values({ name: data.name, cnpj: data.cnpj, razaoSocial: data.razaoSocial })
          .returning()

        await withTenant(
          created!.id,
          ownerUserId,
          async (ctxTx) => {
            // AUD-01/AUD-11: cm_insert_policy (0014) só permite self-insert
            // role='owner' com este flag (bootstrap do fundador); role='member'
            // exige o flag de member (createCompanyMember) ou token de convite.
            await ctxTx.execute(sql`SELECT set_config('app.allow_founder_bootstrap', 'true', true)`)
            await ctxTx
              .insert(companyMember)
              .values({ companyId: created!.id, userId: ownerUserId, role: 'owner' })
          },
          tx,
        )

        return created!
      })
    } catch (error: any) {
      if (getPostgresErrorCode(error) === '23505') {
        throw createError({
          status: 409,
          statusText: '409',
          message: JSON.stringify({
            error: 'conflict',
            message: 'CNPJ already registered',
          }),
        })
      }
      return handleDatabaseError(error)
    }
  }

  async createCompanyMember(
    companyId: string,
    userId: string,
    role = 'member',
  ): Promise<CompanyMemberResult> {
    // AUD-11: este método é bootstrap de MEMBRO (fixtures de teste e futuros
    // fluxos que se auto-adicionam como member). Criar owner exige o caminho
    // de founder (createCompanyWithOwner): a policy 0014 nega role='owner'
    // com o flag de member — e este guard falha cedo com erro claro em vez
    // de 42501 opaco. Adicionar OUTRO usuário é o branch is_company_owner
    // da policy (owner adiciona qualquer membro) — nunca este método.
    // Guard antes do try/catch: é erro de programação, não 503 de serviço.
    if (role !== 'member') {
      throw new Error(
        'createCompanyMember: role must be "member"; owner bootstrap uses createCompanyWithOwner',
      )
    }
    try {
      return await withTenant(companyId, userId, async (tx) => {
        // AUD-01/AUD-11: caminho confiado de inserção de member (fixtures de
        // teste e futuros fluxos de gestão) — marca o tx como bootstrap de
        // member; caminhos de aceite de convite NÃO usam este método (exigem
        // token). O flag não habilita role='owner' (0014).
        await tx.execute(sql`SELECT set_config('app.allow_member_bootstrap', 'true', true)`)
        const [created] = await tx
          .insert(companyMember)
          .values({ companyId, userId, role })
          .returning()
        return created!
      })
    } catch (error: any) {
      if (getPostgresErrorCode(error) === '23505') {
        throw createError({
          status: 409,
          statusText: '409',
          message: JSON.stringify({
            error: 'conflict',
            message: 'User is already a member of this company',
          }),
        })
      }
      return handleDatabaseError(error)
    }
  }

  // AUD-10: busca escopada por vínculo — apenas empresas onde o usuário é
  // member aparecem (antes: qualquer autenticado enumerava nome+CNPJ de tudo).
  // O join roda com withTenant(null, userId): a cm_select_policy (0005) só
  // expõe linhas de company_member com user_id = get_user_id().
  async searchCompanies(query: string, userId: string): Promise<CompanyResult[]> {
    try {
      const pattern = `%${escapeLikePattern(query)}%`
      return await withTenant(null, userId, async (tx) => {
        return await tx
          .select({
            id: company.id,
            name: company.name,
            cnpj: company.cnpj,
            razaoSocial: company.razaoSocial,
            isDeleted: company.isDeleted,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
          })
          .from(companyMember)
          .innerJoin(company, eq(companyMember.companyId, company.id))
          .where(
            and(
              eq(companyMember.userId, userId),
              eq(company.isDeleted, false),
              or(like(company.name, pattern), like(company.cnpj, pattern)),
            ),
          )
          .limit(20)
      })
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async findCompanyById(id: string): Promise<CompanyResult | null> {
    try {
      const [found] = await db
        .select()
        .from(company)
        .where(and(eq(company.id, id), eq(company.isDeleted, false)))
        .limit(1)

      return found || null
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async findUserCompanies(userId: string): Promise<Array<CompanyResult & { role: string }>> {
    try {
      return await withTenant(null, userId, async (tx) => {
        return await tx
          .select({
            id: company.id,
            name: company.name,
            cnpj: company.cnpj,
            razaoSocial: company.razaoSocial,
            isDeleted: company.isDeleted,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
            role: companyMember.role,
          })
          .from(companyMember)
          .innerJoin(company, eq(companyMember.companyId, company.id))
          .where(and(eq(companyMember.userId, userId), eq(company.isDeleted, false)))
      })
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async isCompanyMember(userId: string, companyId: string): Promise<boolean> {
    try {
      return await withTenant(companyId, userId, async (tx) => {
        const [found] = await tx
          .select({ id: companyMember.id })
          .from(companyMember)
          .where(and(eq(companyMember.userId, userId), eq(companyMember.companyId, companyId)))
          .limit(1)
        return !!found
      })
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async getCompanyMembershipRole(userId: string, companyId: string): Promise<string | null> {
    try {
      return await withTenant(companyId, userId, async (tx) => {
        const [found] = await tx
          .select({ role: companyMember.role })
          .from(companyMember)
          .where(and(eq(companyMember.userId, userId), eq(companyMember.companyId, companyId)))
          .limit(1)
        return found?.role ?? null
      })
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async removeCompanyMember(
    companyId: string,
    executedByUserId: string,
    targetUserId: string,
  ): Promise<void> {
    try {
      // executedByUserId define app.user_id: cm_delete_policy (0010) só permite
      // (a) owner remover qualquer member ou (b) o próprio member (não owner)
      // sair. Passar o target como "executor" faria o backstop RLS avaliar a
      // autorização do alvo — nunca fazer isso (mesmo desvio do prompt 20).
      return await withTenant(companyId, executedByUserId, async (tx) => {
        const deleted = await tx
          .delete(companyMember)
          .where(
            and(eq(companyMember.companyId, companyId), eq(companyMember.userId, targetUserId)),
          )
          .returning({ id: companyMember.id })

        if (deleted.length === 0) {
          sendNotFoundError('Company member not found') // RLS negou ou não é membro (0 rows)
        }

        // Sessões do removido não podem continuar apontando para a empresa
        // (context.tenantId no middleware vem de activeCompanyId).
        await tx
          .update(session)
          .set({ activeCompanyId: null, updatedAt: new Date() })
          .where(and(eq(session.userId, targetUserId), eq(session.activeCompanyId, companyId)))
      })
    } catch (error) {
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }

  async setActiveCompany(sessionId: string, companyId: string | null): Promise<void> {
    try {
      await withTenant(companyId, null, async (tx) => {
        await tx
          .update(session)
          .set({ activeCompanyId: companyId, updatedAt: new Date() })
          .where(eq(session.id, sessionId))
      })
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async getActiveCompany(sessionId: string): Promise<string | null> {
    try {
      const [found] = await db
        .select({ activeCompanyId: session.activeCompanyId })
        .from(session)
        .where(eq(session.id, sessionId))
        .limit(1)

      return found?.activeCompanyId || null
    } catch (error) {
      return handleDatabaseError(error)
    }
  }

  async softDeleteCompany(companyId: string, userId: string): Promise<CompanyResult> {
    try {
      return await withTenant(companyId, userId, async (tx) => {
        // ATENÇÃO à ordem: update em company ANTES do delete de members —
        // a policy company_modify_policy exige is_company_owner(id) na execução,
        // e o owner ainda é membro neste ponto; deletar members primeiro faria
        // o check falhar (owner removido) → 0 rows → 404 espúrio.
        const [updated] = await tx
          .update(company)
          .set({ isDeleted: true, updatedAt: new Date() })
          .where(eq(company.id, companyId))
          .returning()
        if (!updated) {
          sendNotFoundError('Company not found') // RLS negou ou já deletada (0 rows)
        }
        await tx.delete(companyMember).where(eq(companyMember.companyId, companyId))
        return updated!
      })
    } catch (error) {
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }

  async updateCompany(
    companyId: string,
    userId: string,
    input: Partial<CreateCompanyInput>,
  ): Promise<CompanyResult> {
    try {
      // userId é obrigatório: company_modify_policy (0009) exige
      // is_company_owner(id), que usa get_user_id() — com user NULL o
      // UPDATE seria sempre negado (0 rows → 404 espúrio).
      return await withTenant(companyId, userId, async (tx) => {
        const updates: Partial<typeof company.$inferInsert> = { updatedAt: new Date() }
        if (input.name !== undefined) updates.name = input.name
        if (input.cnpj !== undefined) updates.cnpj = input.cnpj || null
        if (input.razaoSocial !== undefined) updates.razaoSocial = input.razaoSocial || null

        const [updated] = await tx
          .update(company)
          .set(updates)
          .where(and(eq(company.id, companyId), eq(company.isDeleted, false)))
          .returning()

        if (!updated) {
          sendNotFoundError('Company not found') // RLS negou ou inexistente (0 rows)
        }
        return updated!
      })
    } catch (error: any) {
      if (getPostgresErrorCode(error) === '23505') {
        sendConflictError('CNPJ already registered')
      }
      if (error instanceof H3Error) {
        throw error
      }
      return handleDatabaseError(error)
    }
  }
}

export const companyRepository: ICompanyRepository = new CompanyRepository()

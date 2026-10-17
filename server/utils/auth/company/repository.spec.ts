import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MembershipRepository } from './membership'
import { CompanyRepository, escapeLikePattern } from './repository'
import { withTenant } from '../../db/tenant-context'
import { db } from '../../db'

// Mock withTenant
vi.mock('../../db/tenant-context', () => ({
  withTenant: vi.fn(),
}))

// Mock schema
vi.mock('../../schema', () => ({
  company: {},
  companyMember: {},
  location: {},
  session: {},
}))

// Mock shared/errors
vi.mock('../../shared/errors', () => ({
  sendNotFoundError: vi.fn(() => {
    throw new Error('Not Found')
  }),
  sendForbiddenError: vi.fn(() => {
    throw new Error('Forbidden')
  }),
}))

// Mock db
vi.mock('../../db', () => ({
  db: {
    transaction: vi.fn(),
  },
}))

// Mock crypto.randomUUID
vi.stubGlobal('randomUUID', () => 'test-uuid')

const makeMockTx = () => ({
  insert: vi.fn(() => ({
    values: vi.fn(() => ({ returning: vi.fn() })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn() })),
    })),
  })),
  delete: vi.fn(() => ({
    where: vi.fn(() => ({ returning: vi.fn() })),
  })),
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn() })),
      })),
    })),
  })),
  execute: vi.fn(),
})

describe('escapeLikePattern', () => {
  it('escapes % wildcards', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%')
    expect(escapeLikePattern('%%')).toBe('\\%\\%')
  })

  it('escapes _ wildcards', () => {
    expect(escapeLikePattern('_a')).toBe('\\_a')
  })

  it('escapes backslashes', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b')
  })

  it('leaves plain strings untouched', () => {
    expect(escapeLikePattern('acme')).toBe('acme')
  })
})

describe('CompanyRepository (unit)', () => {
  let repo: CompanyRepository
  let mockTx: ReturnType<typeof makeMockTx>

  beforeEach(() => {
    vi.clearAllMocks()
    repo = new CompanyRepository()
    mockTx = makeMockTx()
    ;(withTenant as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (
        _companyId: string | null,
        _locationId: string | null,
        _userId: string | null,
        fn: (tx: ReturnType<typeof makeMockTx>) => Promise<unknown>,
      ) => {
        return fn(mockTx)
      },
    )
    ;(db.transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: ReturnType<typeof makeMockTx>) => Promise<unknown>) => {
        return fn(mockTx)
      },
    )
  })

  const companyId = 'c1'
  const userId = 'u1'

  describe('createCompany', () => {
    it('creates company without members', async () => {
      const created = {
        id: companyId,
        name: 'Test Co',
        cnpj: null,
        razaoSocial: null,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([created]),
        }),
      })

      const result = await repo.createCompany({ name: 'Test Co' })

      expect(result).toEqual(created)
      expect(mockTx.insert).toHaveBeenCalled()
    })
  })

  describe('createCompanyWithOwner', () => {
    it('creates company with owner member in transaction', async () => {
      const created = {
        id: companyId,
        name: 'Test Co',
        cnpj: null,
        razaoSocial: null,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([created]),
        }),
      })
      mockTx.execute.mockResolvedValue(undefined)

      const result = await repo.createCompanyWithOwner({ name: 'Test Co' }, userId)

      expect(result).toEqual(created)
      expect(db.transaction).toHaveBeenCalled()
    })
  })

  describe('findCompanyById', () => {
    it('returns company when found', async () => {
      const company = { id: companyId, name: 'Test Co', isDeleted: false }
      mockTx.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([company]),
          }),
        }),
      })

      const result = await repo.findCompanyById(companyId, userId)

      expect(result).toEqual(company)
    })

    it('returns null when not found', async () => {
      mockTx.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      })

      const result = await repo.findCompanyById('nonexistent', userId)

      expect(result).toBeNull()
    })
  })

  describe('softDeleteCompany', () => {
    it('soft deletes company and purges memberships', async () => {
      const updated = { id: companyId, isDeleted: true }
      mockTx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      })
      mockTx.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      })

      const result = await repo.softDeleteCompany(companyId, userId)

      expect(result).toEqual(updated)
    })

    it('throws Not Found when company not found', async () => {
      mockTx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      })

      await expect(repo.softDeleteCompany(companyId, userId)).rejects.toThrow('Not Found')
    })
  })

  describe('updateCompany', () => {
    it('updates company fields', async () => {
      const updated = { id: companyId, name: 'Updated Co', updatedAt: new Date() }
      mockTx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      })

      const result = await repo.updateCompany(companyId, userId, { name: 'Updated Co' })

      expect(result).toEqual(updated)
    })

    it('clears cnpj when empty string', async () => {
      const updated = { id: companyId, cnpj: null }
      mockTx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      })

      const result = await repo.updateCompany(companyId, userId, { cnpj: '' })

      expect(result.cnpj).toBeNull()
    })
  })
})

describe('MembershipRepository (unit)', () => {
  let repo: MembershipRepository
  let mockTx: ReturnType<typeof makeMockTx>

  beforeEach(() => {
    vi.clearAllMocks()
    repo = new MembershipRepository()
    mockTx = makeMockTx()
    ;(withTenant as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (
        _companyId: string | null,
        _locationId: string | null,
        _userId: string | null,
        fn: (tx: ReturnType<typeof makeMockTx>) => Promise<unknown>,
      ) => {
        return fn(mockTx)
      },
    )
  })

  const companyId = 'c1'
  const userId = 'u1'

  describe('createCompanyMember', () => {
    it('throws if role is not member', async () => {
      await expect(repo.createCompanyMember(companyId, userId, 'owner')).rejects.toThrow(
        'role must be "member"',
      )
    })

    it('creates member successfully', async () => {
      const created = { id: 'm1', companyId, userId, role: 'member', createdAt: new Date() }
      mockTx.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([created]),
        }),
      })
      mockTx.execute.mockResolvedValue(undefined)

      const result = await repo.createCompanyMember(companyId, userId, 'member')

      expect(result).toEqual(created)
      expect(mockTx.execute).toHaveBeenCalled()
    })
  })

  describe('findUserCompanies', () => {
    it('returns user companies with roles', async () => {
      const companies = [{ id: companyId, name: 'Test Co', role: 'owner' }]
      mockTx.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(companies),
          }),
        }),
      })

      const result = await repo.findUserCompanies(userId)

      expect(result).toEqual(companies)
    })
  })

  describe('isCompanyMember', () => {
    it('returns true when member exists', async () => {
      mockTx.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'm1' }]),
          }),
        }),
      })

      const result = await repo.isCompanyMember(userId, companyId)

      expect(result).toBe(true)
    })

    it('returns false when not member', async () => {
      mockTx.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      })

      const result = await repo.isCompanyMember(userId, companyId)

      expect(result).toBe(false)
    })
  })

  describe('getCompanyMembershipRole', () => {
    it('returns role when member', async () => {
      mockTx.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ role: 'owner' }]),
          }),
        }),
      })

      const result = await repo.getCompanyMembershipRole(userId, companyId)

      expect(result).toBe('owner')
    })

    it('returns null when not member', async () => {
      mockTx.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      })

      const result = await repo.getCompanyMembershipRole(userId, companyId)

      expect(result).toBeNull()
    })
  })

  describe('removeCompanyMember', () => {
    it('removes member', async () => {
      mockTx.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'm1' }]),
        }),
      })

      await repo.removeCompanyMember(companyId, userId, 'target-user')

      expect(mockTx.delete).toHaveBeenCalled()
    })

    it('throws Not Found when member not found', async () => {
      mockTx.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      })

      await expect(repo.removeCompanyMember(companyId, userId, 'target-user')).rejects.toThrow(
        'Not Found',
      )
    })
  })

  describe('setMemberDefaultLocation', () => {
    // Cadeia select().from().where().limit() com resultados sequenciais — o
    // método faz dois selects (membership, depois location).
    function givenSelects(...rows: Array<Array<{ id: string }>>) {
      const limit = vi.fn()
      for (const row of rows) limit.mockResolvedValueOnce(row)
      mockTx.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit }),
        }),
      })
    }

    it('assigns a location belonging to the company', async () => {
      givenSelects([{ id: 'm1' }], [{ id: 'loc-1' }])

      await repo.setMemberDefaultLocation(companyId, userId, 'target-user', 'loc-1')

      expect(mockTx.update).toHaveBeenCalled()
    })

    it('clears the assignment with null and skips the location lookup', async () => {
      givenSelects([{ id: 'm1' }])

      await repo.setMemberDefaultLocation(companyId, userId, 'target-user', null)

      expect(mockTx.update).toHaveBeenCalled()
      expect(mockTx.select).toHaveBeenCalledTimes(1)
    })

    it('404 when the location is not visible to this company (RLS)', async () => {
      givenSelects([{ id: 'm1' }], [])

      await expect(
        repo.setMemberDefaultLocation(companyId, userId, 'target-user', 'other-company-loc'),
      ).rejects.toThrow('Not Found')

      expect(mockTx.update).not.toHaveBeenCalled()
    })

    it('404 when the target is not a member of the company', async () => {
      givenSelects([])

      await expect(
        repo.setMemberDefaultLocation(companyId, userId, 'stranger', 'loc-1'),
      ).rejects.toThrow('Not Found')

      expect(mockTx.update).not.toHaveBeenCalled()
    })
  })
})

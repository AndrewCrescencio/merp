import { beforeEach, describe, it, expect, vi } from 'vitest'

const mockFindCompanyWithLocations = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  createError: (opts: any) => {
    const err = new Error(opts.message)
    ;(err as any).status = opts.status
    ;(err as any).statusCode = opts.status
    throw err
  },
}))

vi.mock('~~/server/utils/auth/company/repository', () => ({
  companyRepository: {
    findCompanyWithLocations: mockFindCompanyWithLocations,
  },
}))

describe('GET /api/v1/companies/[companyId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindCompanyWithLocations.mockResolvedValue(null)
  })

  const authContext = {
    user: { id: 'user-a', email: 'a@e2e.test', name: 'User A' },
    session: { id: 'session-1' },
    tenant: { companyId: 'company-b', role: 'member' },
  }

  it('retorna 401 quando não há sessão', async () => {
    const handler = await import('~~/server/api/v1/companies/[companyId]/index.get').then(
      (m) => m.default,
    )
    await expect(handler({ context: {} } as any)).rejects.toThrow('Authentication required.')
  })

  it('retorna 404 quando a empresa não é visível ao usuário (cross-tenant)', async () => {
    const handler = await import('~~/server/api/v1/companies/[companyId]/index.get').then(
      (m) => m.default,
    )
    const event = { context: authContext } as any

    await expect(handler(event)).rejects.toThrow('Company not found')
    expect(mockFindCompanyWithLocations).toHaveBeenCalledWith('company-b', 'user-a')
  })

  it('retorna 200 com a empresa e os locais do tenant resolvido pelo middleware', async () => {
    mockFindCompanyWithLocations.mockResolvedValue({
      id: 'company-b',
      name: 'Co B',
      cnpj: null,
      razaoSocial: null,
      isDeleted: false,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      locations: [
        {
          id: 'loc-1',
          name: 'Matriz',
          isActive: true,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
        },
      ],
    })

    const handler = await import('~~/server/api/v1/companies/[companyId]/index.get').then(
      (m) => m.default,
    )
    const event = { context: authContext } as any

    const result = await handler(event)

    expect(result).toEqual({
      id: 'company-b',
      name: 'Co B',
      cnpj: null,
      razaoSocial: null,
      isDeleted: false,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      locations: [
        {
          id: 'loc-1',
          name: 'Matriz',
          isActive: true,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
        },
      ],
    })
    expect(mockFindCompanyWithLocations).toHaveBeenCalledWith('company-b', 'user-a')
  })
})

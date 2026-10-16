import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveLocationId, requireLocationId } from './location'

const mockWithTenant = vi.fn()

vi.mock('../db/tenant-context', () => ({
  withTenant: (...args: unknown[]) => mockWithTenant(...args),
}))

// O resolver só faz um select de uma linha em company_member.
vi.mock('../schema', () => ({
  companyMember: { companyId: {}, userId: {}, defaultLocationId: {} },
}))

function makeTx(row: { defaultLocationId: string } | undefined) {
  const limit = vi.fn().mockResolvedValue(row ? [row] : [])
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  return { select: vi.fn().mockReturnValue({ from }) }
}

function givenTx(row: { defaultLocationId: string } | undefined) {
  const tx = makeTx(row)
  mockWithTenant.mockImplementation(
    async (
      _companyId: string,
      _locationId: string | null,
      _userId: string | null,
      fn: (t: unknown) => Promise<unknown>,
    ) => fn(tx),
  )
  return tx
}

describe('resolveLocationId (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the member default location', async () => {
    givenTx({ defaultLocationId: 'loc-1' })

    await expect(resolveLocationId('company-1', 'user-1')).resolves.toBe('loc-1')
  })

  it('returns null when the member has no default location', async () => {
    givenTx(undefined)

    await expect(resolveLocationId('company-1', 'user-1')).resolves.toBeNull()
  })

  it('scopes the lookup to the requesting company and user (tenant + user na GUC)', async () => {
    givenTx({ defaultLocationId: 'loc-1' })
    const seen: unknown[] = []
    mockWithTenant.mockImplementation(
      async (
        companyId: string,
        locationId: string | null,
        userId: string | null,
        fn: (t: unknown) => Promise<unknown>,
      ) => {
        seen.push(companyId, locationId, userId)
        return fn(makeTx({ defaultLocationId: 'loc-1' }))
      },
    )

    await resolveLocationId('company-1', 'user-1')

    // locationId null de propósito: limpa a GUC em vez de herdar a externa.
    expect(seen).toEqual(['company-1', null, 'user-1'])
  })
})

describe('requireLocationId (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the id when a default location is configured', async () => {
    givenTx({ defaultLocationId: 'loc-1' })

    await expect(requireLocationId('company-1', 'user-1')).resolves.toBe('loc-1')
  })

  it('rejects with an actionable 400 instead of letting the write hit the FK', async () => {
    givenTx(undefined)

    await expect(requireLocationId('company-1', 'user-1')).rejects.toThrow(
      'No default location configured',
    )
  })
})

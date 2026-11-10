import { describe, expect, it } from 'vitest'
import { assertRlsForceApplied } from '../../scripts/verify-rls'

// Cliente falso: devolve as linhas que a query de guarda devolveria.
function fakeClient(rows: { relname: string }[]) {
  return { unsafe: async () => rows }
}

describe('assertRlsForceApplied (guarda FORCE)', () => {
  it('passa quando todas as tabelas RLS têm FORCE', async () => {
    await expect(assertRlsForceApplied(fakeClient([]))).resolves.toBeUndefined()
  })

  it('falha quando há tabela com RLS sem FORCE', async () => {
    const client = fakeClient([{ relname: 'company' }, { relname: 'location' }])
    await expect(assertRlsForceApplied(client)).rejects.toThrow(
      /RLS sem FORCE em 2 tabela\(s\): company, location/,
    )
  })

  it('inclui a instrução de correção na mensagem', async () => {
    const client = fakeClient([{ relname: 'invite' }])
    await expect(assertRlsForceApplied(client)).rejects.toThrow(/0002_rls_policies_grants/)
  })
})

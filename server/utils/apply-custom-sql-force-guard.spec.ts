import { describe, expect, it } from 'vitest'
import { assertRlsForceApplied } from './apply-custom-sql'

// Cliente falso: devolve as linhas que a query de guarda devolveria.
function fakeClient(rows: { relname: string }[]) {
  return { unsafe: async () => rows }
}

describe('assertRlsForceApplied (guarda FORCE)', () => {
  it('passa quando todas as tabelas RLS têm FORCE', async () => {
    await expect(assertRlsForceApplied(fakeClient([]))).resolves.toBeUndefined()
  })

  it('falha quando há tabela com RLS sem FORCE', async () => {
    const client = fakeClient([{ relname: 'party' }, { relname: 'order' }])
    await expect(assertRlsForceApplied(client)).rejects.toThrow(
      /RLS sem FORCE em 2 tabela\(s\): party, order/,
    )
  })

  it('inclui a instrução de correção na mensagem', async () => {
    const client = fakeClient([{ relname: 'product' }])
    await expect(assertRlsForceApplied(client)).rejects.toThrow(/0025/)
  })
})

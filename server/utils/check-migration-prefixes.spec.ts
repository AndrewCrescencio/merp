import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { prefixOf, findDuplicates, findPrefixProblems } from '~~/scripts/check-migration-prefixes'

describe('check-migration-prefixes', () => {
  it('prefixOf lê o prefixo drizzle (0000_) e o custom (C001_)', () => {
    expect(prefixOf('0000_functions_and_roles.sql')).toBe('0')
    expect(prefixOf('0012_add_print.sql')).toBe('12')
    expect(prefixOf('C001_custom.sql')).toBe('1')
    expect(prefixOf('README.md')).toBeNull()
    expect(prefixOf('_journal.json')).toBeNull()
  })

  it('findDuplicates apanha o mesmo número escrito de duas formas', () => {
    const dupes = findDuplicates(['0001_a.sql', 'C001_b.sql', '0002_c.sql'])
    expect([...dupes.keys()]).toEqual(['1'])
    expect(dupes.get('1')).toEqual(['0001_a.sql', 'C001_b.sql'])
  })

  it('findDuplicates ignora ficheiros sem prefixo', () => {
    expect(findDuplicates(['README.md', '0000_only.sql']).size).toBe(0)
  })

  it('o repositório real está sem prefixos duplicados', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url))
    expect(findPrefixProblems(root)).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { validateDefaultLocationInput } from './validate'

describe('validateDefaultLocationInput', () => {
  it('accepts a location id', () => {
    expect(validateDefaultLocationInput({ defaultLocationId: 'loc-1' })).toEqual({
      defaultLocationId: 'loc-1',
    })
  })

  it('treats null as an explicit clear (volta o membro ao escopo company)', () => {
    expect(validateDefaultLocationInput({ defaultLocationId: null })).toEqual({
      defaultLocationId: null,
    })
  })

  it('rejects an omitted field — não pode virar clear por acidente', () => {
    expect(() => validateDefaultLocationInput({})).toThrow('defaultLocationId must be')
  })

  it('rejects empty and non-string values', () => {
    expect(() => validateDefaultLocationInput({ defaultLocationId: '   ' })).toThrow(
      'defaultLocationId must be',
    )
    expect(() => validateDefaultLocationInput({ defaultLocationId: 42 })).toThrow(
      'defaultLocationId must be',
    )
  })
})

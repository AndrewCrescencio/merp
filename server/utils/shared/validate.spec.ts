import { describe, it, expect } from 'vitest'
import {
  validateDefaultLocationInput,
  validateCompanyCreateInput,
  validateCompanySearchInput,
  validateLocationCreateInput,
  validateLocationUpdateInput,
  validateLoginInput,
} from './validate'

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

describe('nullish input validation', () => {
  it('returns validation errors for null and undefined objects and queries', () => {
    for (const input of [null, undefined]) {
      expect(() => validateCompanyCreateInput(input)).toThrow('Company name is required')
      expect(() => validateCompanySearchInput(input)).toThrow('Search query is required')
    }
  })
})

describe('validateLoginInput', () => {
  it('normalizes the email and defaults rememberMe to false', () => {
    expect(validateLoginInput({ email: ' A@B.C ', password: 'x' })).toEqual({
      email: 'a@b.c',
      password: 'x',
      rememberMe: false,
    })
  })

  it('only accepts rememberMe === true', () => {
    expect(
      validateLoginInput({ email: 'a@b.c', password: 'x', rememberMe: 'yes' }).rememberMe,
    ).toBe(false)
    expect(validateLoginInput({ email: 'a@b.c', password: 'x', rememberMe: true }).rememberMe).toBe(
      true,
    )
  })

  it('rejects missing email, empty or non-string password and a null body', () => {
    for (const body of [
      { password: 'x' },
      { email: 'a@b.c', password: '' },
      { email: 'a@b.c', password: 123 },
      null,
    ]) {
      expect(() => validateLoginInput(body)).toThrow('Email and password are required')
    }
  })
})

describe('validateLocationCreateInput', () => {
  it('trims the name', () => {
    expect(validateLocationCreateInput({ name: '  Filial  ' })).toEqual({ name: 'Filial' })
  })

  it('rejects blank, non-string and names over 200 characters', () => {
    for (const body of [{}, { name: '   ' }, { name: 42 }, { name: 'a'.repeat(201) }, null]) {
      expect(() => validateLocationCreateInput(body)).toThrow('name is required')
    }
  })
})

describe('validateLocationUpdateInput', () => {
  it('returns only the provided fields', () => {
    expect(validateLocationUpdateInput({ name: ' Nova ' })).toEqual({ name: 'Nova' })
    expect(validateLocationUpdateInput({ isActive: false })).toEqual({ isActive: false })
  })

  it('rejects an empty update and invalid field types', () => {
    for (const body of [{}, { name: '' }, { isActive: 'false' }, { name: 'a'.repeat(201) }, null]) {
      expect(() => validateLocationUpdateInput(body)).toThrow('name or isActive is required')
    }
  })
})

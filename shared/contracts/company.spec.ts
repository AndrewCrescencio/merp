import { describe, expect, it } from 'vitest'
import { companyUpdateSchema } from './company'

describe('companyUpdateSchema', () => {
  it('normalizes the same wire input into the server output type', () => {
    expect(companyUpdateSchema.parse({ name: '  Nova empresa  ', extra: 1 })).toEqual({
      name: 'Nova empresa',
    })
  })

  it('rejects an empty patch and invalid names', () => {
    expect(companyUpdateSchema.safeParse({}).error?.issues[0]?.message).toBe(
      'At least one field (name) is required',
    )
    expect(companyUpdateSchema.safeParse({ name: '  ' }).error?.issues[0]?.message).toBe(
      'Company name must be a non-empty string',
    )
  })
})

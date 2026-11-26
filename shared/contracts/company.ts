import { z } from 'zod'

export const companyUpdateSchema = z.object({
  name: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'At least one field (name) is required'
          : 'Company name must be a non-empty string',
    })
    .trim()
    .min(1, 'Company name must be a non-empty string')
    .max(200, 'Company name must be at most 200 characters'),
})

export type CompanyUpdateInput = z.output<typeof companyUpdateSchema>

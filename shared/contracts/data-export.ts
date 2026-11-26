import { z } from 'zod'

export const MAX_AUTH_EVENTS_PER_PAGE = 500

export const dataExportQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^[1-9]\d{0,2}$/)
    .transform(Number)
    .pipe(z.number().max(MAX_AUTH_EVENTS_PER_PAGE))
    .optional(),
  cursor: z
    .string()
    .max(4096)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
})

const timestamp = z.iso.datetime({ precision: 6 }).refine((value) => !value.startsWith('0000-'))

export const authEventCursorSchema = z
  .object({
    cutoff: timestamp,
    createdAt: timestamp,
    id: z
      .string()
      .min(1)
      .refine((value) => !value.includes('\0')),
  })
  .refine(({ createdAt, cutoff }) => createdAt <= cutoff)

export type AuthEventCursor = z.output<typeof authEventCursorSchema>

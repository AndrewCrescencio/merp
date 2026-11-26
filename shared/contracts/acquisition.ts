import { z } from 'zod'

export const acquisitionChannelSchema = z.enum([
  'search',
  'social',
  'referral',
  'advertising',
  'event',
  'other',
])

export type AcquisitionChannel = z.infer<typeof acquisitionChannelSchema>

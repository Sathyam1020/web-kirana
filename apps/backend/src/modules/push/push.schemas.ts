import { z } from "zod"

/** Matches the browser's PushSubscription.toJSON() shape. */
export const subscribeBodySchema = z
  .object({
    endpoint: z.string().url(),
    keys: z
      .object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      })
      .strict(),
    userAgent: z.string().max(500).optional(),
  })
  .strict()
export type SubscribeBody = z.infer<typeof subscribeBodySchema>

export const unsubscribeBodySchema = z.object({ endpoint: z.string().url() }).strict()
export type UnsubscribeBody = z.infer<typeof unsubscribeBodySchema>

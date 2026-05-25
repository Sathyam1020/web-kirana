import { z } from "zod"

// cuid format isn't strictly required (the WHERE clauses scope the rows so a
// bad id resolves to 404 / no-op) — keep this lenient so the schema doesn't
// silently lock us in if id format changes later.
export const userIdParamSchema = z.strictObject({
  id: z.string().min(1).max(40),
})
export type UserIdParam = z.infer<typeof userIdParamSchema>

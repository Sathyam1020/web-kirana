import { z } from "zod"
import { Role } from "../../generated/prisma/enums.js"
import { isLooksLikePhone } from "../../lib/phone.js"

const phoneSchema = z
  .string()
  .max(40)
  .refine(isLooksLikePhone, { message: "Invalid phone number" })

const passwordSchema = z.string().min(8).max(128)

// Signup is open for CUSTOMER and OWNER. ADMIN accounts are seeded only.
const publicRoleSchema = z.enum([Role.CUSTOMER, Role.OWNER])

export const signupBodySchema = z.strictObject({
  phone: phoneSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
  role: publicRoleSchema,
})
export type SignupBody = z.infer<typeof signupBodySchema>

export const loginBodySchema = z.strictObject({
  phone: phoneSchema,
  password: z.string().min(1).max(128), // length-checked on signup; here just non-empty
})
export type LoginBody = z.infer<typeof loginBodySchema>

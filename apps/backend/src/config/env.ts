import "dotenv/config"
import { z } from "zod"

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url(),
    TEST_DATABASE_URL: z.string().url().optional(),

    CORS_ALLOWED_ORIGINS: z
      .string()
      .default("http://localhost:3000,http://localhost:3001")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      ),

    // --- Auth (Phase 3) ----------------------------------------------------
    // Used for HS256 signing of access JWTs. Minimum 32 bytes of secret; rotate
    // by deploying a new value (all live access tokens become invalid).
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    // Optional cookie scope for cross-subdomain prod setups (e.g.,
    // `.kirana.com` so api.kirana.com sets a cookie usable by
    // customer.kirana.com). Leave unset in dev.
    AUTH_COOKIE_DOMAIN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.JWT_ACCESS_SECRET.length < 48) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_ACCESS_SECRET"],
        message: "Production JWT_ACCESS_SECRET must be at least 48 chars",
      })
    }
  })

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  process.stderr.write(
    `Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors, null, 2)}\n`,
  )
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env

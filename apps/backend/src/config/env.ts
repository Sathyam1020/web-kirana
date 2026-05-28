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

    // --- Auth (Phase 6.5: better-auth) -------------------------------------
    // Single shared secret used by better-auth for session signing + CSRF
    // tokens. Rotate by deploying a new value (existing sessions invalidate).
    BETTER_AUTH_SECRET: z.string().min(32),
    // Origin where this auth server is hosted. Used by better-auth to set
    // cookie domain + validate trusted origins. http://localhost:4000 in dev.
    BETTER_AUTH_URL: z.string().url(),
    // Optional cookie scope for cross-subdomain prod (e.g. `.kirana.com`).
    AUTH_COOKIE_DOMAIN: z.string().optional(),

    // --- Cloudinary (Phase 6.7: signed image uploads) ---------------------
    // Optional on purpose: the backend boots without them so dev isn't
    // blocked. The /uploads/signature endpoints return 503 until all three
    // are set. Never sent to the client except cloud_name + api_key (which
    // are public by design); the api_secret only ever signs server-side.
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.BETTER_AUTH_SECRET.length < 48) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BETTER_AUTH_SECRET"],
        message: "Production BETTER_AUTH_SECRET must be at least 48 chars",
      })
    }
    // The Socket.IO CORS allowlist (and the REST one) reuse CORS_ALLOWED_ORIGINS.
    // The localhost default is fine for dev but must never silently ship to
    // prod, where the socket layer would degrade to a localhost-only allowlist.
    if (
      env.NODE_ENV === "production" &&
      (process.env.CORS_ALLOWED_ORIGINS ?? "").trim() === ""
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ALLOWED_ORIGINS"],
        message: "CORS_ALLOWED_ORIGINS must be set explicitly in production",
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

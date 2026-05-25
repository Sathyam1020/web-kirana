import "dotenv/config"
import { z } from "zod"

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  DATABASE_URL: z.string().url(),
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
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  // Env failure must surface even before the logger is built.
  process.stderr.write(
    `Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors, null, 2)}\n`,
  )
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env

/**
 * Better-auth instance. Owns the whole /v1/auth/* surface.
 *
 * Design choices (locked in CLEANUP.md Phase 6.5):
 *   - emailAndPassword as the primary credential. Email is the login id.
 *   - phone is an additionalField, required, validated server-side via the
 *     existing normalizePhone helper inside the user.create hook.
 *   - role is an additionalField, defaults to CUSTOMER. ADMIN signups are
 *     rejected in the same hook (admins are seeded only).
 *   - isApproved gates the session: OWNER signups land isApproved=false and
 *     session.create rejects until an admin flips it.
 *   - 30-day rolling session cookie ("kirana-session") with 24h sliding
 *     refresh. Cookie cache (5 min in-memory) cuts DB hits on hot paths.
 *   - Rate limiter is built-in; we drop the old auth-rate-limit middleware.
 *
 * The session-on-page-reload bug we're fixing comes for free: the cookie
 * lives in the browser (httpOnly), better-auth re-reads it on every request,
 * no in-memory access-token to lose.
 */

import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { APIError } from "better-auth/api"
import { env } from "../config/env.js"
import { prisma } from "../db/prisma.js"
import { Role } from "../generated/prisma/enums.js"
import { logger } from "./logger.js"
import { isLooksLikePhone, normalizePhone } from "./phone.js"

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  // Default is "/api/auth"; we mount at /v1/auth to match the rest of v1.
  basePath: "/v1/auth",
  trustedOrigins: env.CORS_ALLOWED_ORIGINS,

  emailAndPassword: {
    enabled: true,
    // Log them in immediately on signup — the FE doesn't need a separate
    // "now log in" step after a successful POST /sign-up/email.
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  user: {
    additionalFields: {
      // Required on every signup. Validated + normalized in the user.create
      // hook below; @unique on the column rejects duplicates at the DB.
      phone: {
        type: "string",
        required: true,
        input: true,
      },
      // CUSTOMER by default; OWNER goes through the admin-approval gate.
      // ADMIN signup is closed (rejected in the hook).
      role: {
        type: "string",
        required: false,
        input: true,
        defaultValue: Role.CUSTOMER,
      },
      // System-managed — never accepted from the client.
      isApproved: {
        type: "boolean",
        required: false,
        input: false,
        defaultValue: true,
      },
      approvedAt: {
        type: "date",
        required: false,
        input: false,
      },
      approvedById: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },

  session: {
    // Follows better-auth's documented "30-day persistent login" recipe.
    // Three intertwined settings + a non-default freshAge — getting any
    // one wrong causes a "flash of logged out":
    //
    //   expiresIn  (30d): hard ceiling for the session.
    //   updateAge  (1d):  sliding refresh — re-stamps expiresAt every 24h
    //                     of use so an active user never gets logged out.
    //   cookieCache.maxAge (30d): MUST match expiresIn. The shadow cookie
    //                     getting Max-Age'd shorter than the session is
    //                     what caused the every-5-min-loading bug (we
    //                     originally set 300s here per a stale doc).
    //   freshAge (0):     disable the "you must reauth for sensitive
    //                     actions after X" gate. We don't have any
    //                     reauth-required flows, and the default 1d was
    //                     close enough to trigger spurious checks.
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 0,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 30,
    },
  },

  // Cookie defaults. The prefix namespaces cookies as `kirana.session_token`
  // (and `kirana.session_data` for the cache shadow) so multiple apps on the
  // same domain don't collide.
  advanced: {
    cookiePrefix: "kirana",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      ...(env.AUTH_COOKIE_DOMAIN !== undefined
        ? { domain: env.AUTH_COOKIE_DOMAIN }
        : {}),
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          // better-auth types `data` as the base User columns. Our
          // additionalFields (phone, role, isApproved) are present at
          // runtime but unknown to the type. Cast through unknown to
          // a structural shape we can mutate safely.
          const mutable = data as unknown as {
            phone?: unknown
            role?: Role
            isApproved?: boolean
          }

          // Validate phone (matches today's behaviour byte-for-byte).
          if (typeof mutable.phone !== "string" || !isLooksLikePhone(mutable.phone)) {
            throw new APIError("BAD_REQUEST", { message: "Invalid phone number" })
          }
          mutable.phone = normalizePhone(mutable.phone)

          // Role gate.
          if (mutable.role === Role.ADMIN) {
            // Closed signup — only seeded admins exist.
            throw new APIError("FORBIDDEN", { message: "ADMIN signup is not allowed" })
          }
          if (mutable.role === Role.OWNER) {
            // Owner waits for an admin to flip the flag.
            mutable.isApproved = false
          }
          return { data }
        },
      },
    },
    session: {
      create: {
        before: async (data) => {
          // Block login for owners whose admin approval is still pending.
          const user = await prisma.user.findUnique({
            where: { id: data.userId },
            select: { role: true, isApproved: true },
          })
          if (user === null) {
            throw new APIError("UNAUTHORIZED", { message: "User not found" })
          }
          if (user.role === Role.OWNER && !user.isApproved) {
            throw new APIError("FORBIDDEN", {
              message: "Account is pending admin approval",
            })
          }
          return { data }
        },
      },
    },
  },

  rateLimit: {
    // Tests burst from a single IP; disable in test the same way the old
    // auth-rate-limit middleware did (see PROGRESS.md → Test infrastructure).
    enabled: env.NODE_ENV !== "test",
    storage: "memory", // OK for single-process dev; "database" for prod multi-instance
    window: 60,
    max: 100,
    customRules: {
      // Tighter limits on the hot auth paths (matches the old per-route
      // limits in middleware/auth-rate-limit that we're deleting).
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },

  logger: {
    // Bridge better-auth's logger to our pino instance so auth events land
    // in the same JSON stream as everything else.
    log(level, message, ...args) {
      const pinoLevel: "error" | "warn" | "info" | "debug" =
        level === "error" || level === "warn" || level === "debug" ? level : "info"
      logger[pinoLevel]({ args }, `[better-auth] ${message}`)
    },
  },
})

export type Auth = typeof auth
export type Session = Awaited<ReturnType<typeof auth.api.getSession>>

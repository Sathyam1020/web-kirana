/**
 * Test helpers: phone/email prefixes scoped to a single test run so the
 * shared seed survives, plus factories that produce authenticated callers
 * (customer / approved owner / admin) for supertest.
 *
 * Phase 6.5: auth moved from JWT bearer header to a session COOKIE managed
 * by better-auth. The caller object now exposes a `cookieHeader` string
 * that test calls pass to `.set("Cookie", caller.cookieHeader)`. Older
 * `Authorization: Bearer …` patterns no longer authenticate.
 */

import { randomInt } from "node:crypto"
import type { Express } from "express"
import request from "supertest"
import { prisma } from "../../src/db/prisma.js"
import { Role } from "../../src/generated/prisma/enums.js"

const RUN_ID = randomInt(1_000_000, 9_999_999).toString()
const PHONE_PREFIX = `+9988${RUN_ID}`
const EMAIL_DOMAIN = `${RUN_ID}.kirana.test`
const PASSWORD = "Password123!"
const SEED_ADMIN_EMAIL = "admin@kirana.local"

let nextUserSuffix = 100
export function nextPhone(): string {
  const suffix = String(nextUserSuffix++).padStart(3, "0")
  return `${PHONE_PREFIX}${suffix}`
}

export function nextEmail(label = "user"): string {
  const suffix = String(nextUserSuffix++).padStart(3, "0")
  return `${label}-${suffix}@${EMAIL_DOMAIN}`
}

export function isRunPhone(phone: string): boolean {
  return phone.startsWith(PHONE_PREFIX)
}

// --- Auth factories -----------------------------------------------------

export interface AuthedCaller {
  user: {
    id: string
    email: string
    phone: string
    role: Role
    name: string
  }
  /**
   * Concatenated Cookie header value (one or more `name=value; ...` pairs).
   * Pass to supertest like: `.set("Cookie", caller.cookieHeader)`.
   */
  cookieHeader: string
}

/**
 * Reads supertest's set-cookie response array (or a single string) and turns
 * it into a single Cookie header value (the format request headers want).
 */
function extractCookieHeader(res: request.Response): string {
  const raw = res.headers["set-cookie"]
  if (raw === undefined) {
    throw new Error("Auth factory: response had no set-cookie header")
  }
  const cookies = Array.isArray(raw) ? raw : [raw]
  // Each set-cookie value is like "name=value; Path=/; HttpOnly; ...".
  // Cookie request headers only want the name=value pairs joined by "; ".
  return cookies
    .map((c) => c.split(";")[0])
    .filter((c): c is string => c !== undefined && c.length > 0)
    .join("; ")
}

interface SignupOpts {
  email?: string
  name: string
  phone: string
  role: Role
}

/**
 * Calls POST /v1/auth/sign-up/email and returns the resulting cookie + the
 * created user row. `autoSignIn: true` in lib/auth.ts means the response
 * already carries the session cookie — no separate login call needed.
 */
async function signUpAndCaptureCookie(
  app: Express,
  opts: SignupOpts,
): Promise<{ cookieHeader: string; userId: string; email: string }> {
  const email = opts.email ?? nextEmail()
  const res = await request(app)
    .post("/v1/auth/sign-up/email")
    .send({
      email,
      password: PASSWORD,
      name: opts.name,
      phone: opts.phone,
      role: opts.role,
    })
  if (res.status !== 200) {
    throw new Error(
      `sign-up/email failed (${res.status}): ${JSON.stringify(res.body)}`,
    )
  }
  const cookieHeader = extractCookieHeader(res)
  // Better-auth returns { token, user: { id, ... } }
  const userId = (res.body?.user?.id ?? res.body?.data?.user?.id) as string | undefined
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error(`sign-up/email response missing user.id: ${JSON.stringify(res.body)}`)
  }
  return { cookieHeader, userId, email }
}

/** Signs up a CUSTOMER and returns a session-bearing caller. */
export async function signupCustomer(
  app: Express,
  name = "Test Customer",
): Promise<AuthedCaller> {
  const phone = nextPhone()
  const { cookieHeader, userId, email } = await signUpAndCaptureCookie(app, {
    name,
    phone,
    role: Role.CUSTOMER,
  })
  return {
    user: { id: userId, email, phone, role: Role.CUSTOMER, name },
    cookieHeader,
  }
}

/**
 * Signs up an OWNER, flips isApproved=true directly in the DB (bypasses the
 * admin endpoint — that flow is tested in auth.test.ts), then logs them in
 * to get a fresh session cookie. The signup itself does NOT issue a usable
 * session because the session.create hook rejects pending owners.
 */
export async function signupApprovedOwner(
  app: Express,
  name = "Test Owner",
): Promise<AuthedCaller> {
  const phone = nextPhone()
  const email = nextEmail("owner")

  // Signup — the user.create hook sets isApproved=false for OWNER role,
  // and the session.create hook rejects login, so no session is issued.
  // Better-auth returns 403 in this case; we don't treat it as an error.
  const signupRes = await request(app)
    .post("/v1/auth/sign-up/email")
    .send({
      email,
      password: PASSWORD,
      name,
      phone,
      role: Role.OWNER,
    })
  if (signupRes.status !== 200 && signupRes.status !== 403) {
    throw new Error(
      `owner sign-up failed unexpectedly (${signupRes.status}): ${JSON.stringify(signupRes.body)}`,
    )
  }

  // Approve directly in the DB.
  await prisma.user.update({
    where: { email },
    data: { isApproved: true, approvedAt: new Date() },
  })

  // Now sign in to capture a real session cookie.
  const loginRes = await request(app)
    .post("/v1/auth/sign-in/email")
    .send({ email, password: PASSWORD })
  if (loginRes.status !== 200) {
    throw new Error(`owner login failed (${loginRes.status}): ${JSON.stringify(loginRes.body)}`)
  }
  const cookieHeader = extractCookieHeader(loginRes)
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true },
  })
  return {
    user: { id: user.id, email, phone, role: Role.OWNER, name },
    cookieHeader,
  }
}

/** Signs in the seeded admin (email admin@kirana.local) and returns a caller. */
export async function loginSeededAdmin(app: Express): Promise<AuthedCaller> {
  const res = await request(app)
    .post("/v1/auth/sign-in/email")
    .send({ email: SEED_ADMIN_EMAIL, password: PASSWORD })
  if (res.status !== 200) {
    throw new Error(`admin login failed (${res.status}): ${JSON.stringify(res.body)}`)
  }
  const cookieHeader = extractCookieHeader(res)
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: SEED_ADMIN_EMAIL },
    select: { id: true, phone: true, name: true },
  })
  return {
    user: {
      id: admin.id,
      email: SEED_ADMIN_EMAIL,
      phone: admin.phone,
      role: Role.ADMIN,
      name: admin.name,
    },
    cookieHeader,
  }
}

// --- Cleanup ------------------------------------------------------------

/**
 * Removes everything this test run created. Order matters because of FK
 * Restrict relationships (Category ← Product, User ← Store etc.). Cascades
 * handle the rest (User → Store, Address, Session, Account, …).
 */
export async function cleanupRun(): Promise<void> {
  await prisma.user.deleteMany({
    where: {
      OR: [
        { phone: { startsWith: PHONE_PREFIX } },
        { email: { endsWith: `@${EMAIL_DOMAIN}` } },
      ],
    },
  })

  // Tests that create categories use the TEST_PREFIX to mark them.
  await prisma.category.deleteMany({
    where: { name: { startsWith: TEST_CATEGORY_PREFIX } },
  })
}

export const TEST_CATEGORY_PREFIX = "ZZZ-TEST-"

/** Returns a unique category name for this test, with the marker prefix. */
let nextCategorySuffix = 1
export function nextCategoryName(label = "Cat"): string {
  return `${TEST_CATEGORY_PREFIX}${label}-${RUN_ID}-${nextCategorySuffix++}`
}

// --- Phase 6.6 — taxonomy helpers ---------------------------------------

/**
 * Find or create a Subcategory under (storeId, categoryId) named after the
 * Category itself. Lets the older tests keep passing a categoryId while
 * the new Product create endpoint requires subcategoryId.
 *
 * Idempotent — re-callable from within the same test without dup-key risk.
 */
export async function ensureSubcategoryForStore(
  storeId: string,
  categoryId: string,
): Promise<string> {
  const cat = await prisma.category.findUniqueOrThrow({
    where: { id: categoryId },
    select: { name: true },
  })
  const existing = await prisma.subcategory.findUnique({
    where: { storeId_categoryId_name: { storeId, categoryId, name: cat.name } },
    select: { id: true },
  })
  if (existing) return existing.id
  const created = await prisma.subcategory.create({
    data: { storeId, categoryId, name: cat.name, displayOrder: 0, isAvailable: true },
    select: { id: true },
  })
  return created.id
}

/**
 * Convenience for OWNER-authed test calls — looks up the caller's storeId
 * and resolves a subcategory under the given admin category.
 */
export async function ensureSubcategoryForOwner(
  owner: AuthedCaller,
  categoryId: string,
): Promise<string> {
  const store = await prisma.store.findUniqueOrThrow({
    where: { ownerId: owner.user.id },
    select: { id: true },
  })
  return ensureSubcategoryForStore(store.id, categoryId)
}

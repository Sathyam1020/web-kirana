/**
 * Test helpers: a per-run phone prefix so the shared DB seed survives, plus
 * factories that produce authenticated callers (customer / approved owner /
 * admin) for use with supertest. `cleanup()` nukes only what the run produced.
 */

import { randomInt } from "node:crypto"
import type { Express } from "express"
import request from "supertest"
import { prisma } from "../../src/db/prisma.js"
import { Role } from "../../src/generated/prisma/enums.js"

const RUN_ID = randomInt(1_000_000, 9_999_999).toString()
const PREFIX = `+9988${RUN_ID}`
const PASSWORD = "Password123!"
const SEED_ADMIN_PHONE = "+919900000000"

let nextUserSuffix = 100
export function nextPhone(): string {
  const suffix = String(nextUserSuffix++).padStart(3, "0")
  return `${PREFIX}${suffix}`
}

export function isRunPhone(phone: string): boolean {
  return phone.startsWith(PREFIX)
}

// --- Auth factories -----------------------------------------------------

export interface AuthedCaller {
  user: { id: string; phone: string; role: Role; name: string }
  accessToken: string
  /** Pre-built Authorization header value: "Bearer <token>". */
  bearer: string
}

async function postJson<TBody>(
  app: Express,
  path: string,
  body: TBody,
  headers?: Record<string, string>,
): Promise<request.Response> {
  let req = request(app).post(path)
  if (headers !== undefined) {
    for (const [k, v] of Object.entries(headers)) req = req.set(k, v)
  }
  return req.send(body as object)
}

/** Signs up a CUSTOMER, returns auth context. */
export async function signupCustomer(app: Express, name = "Test Customer"): Promise<AuthedCaller> {
  const phone = nextPhone()
  const res = await postJson(app, "/v1/auth/signup", {
    phone,
    password: PASSWORD,
    name,
    role: Role.CUSTOMER,
  })
  if (res.status !== 201) {
    throw new Error(`signupCustomer failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  const accessToken = res.body.data.accessToken as string
  return {
    user: { id: res.body.data.user.id, phone, role: Role.CUSTOMER, name },
    accessToken,
    bearer: `Bearer ${accessToken}`,
  }
}

/**
 * Signs up an OWNER, then DIRECTLY approves them in the DB (bypasses the
 * admin endpoint — that flow is tested in auth.test.ts). Logs them in and
 * returns auth context.
 */
export async function signupApprovedOwner(app: Express, name = "Test Owner"): Promise<AuthedCaller> {
  const phone = nextPhone()
  const signup = await postJson(app, "/v1/auth/signup", {
    phone,
    password: PASSWORD,
    name,
    role: Role.OWNER,
  })
  if (signup.status !== 201) {
    throw new Error(`owner signup failed: ${signup.status} ${JSON.stringify(signup.body)}`)
  }
  await prisma.user.update({
    where: { phone },
    data: { isApproved: true, approvedAt: new Date() },
  })
  const login = await postJson(app, "/v1/auth/login", { phone, password: PASSWORD })
  if (login.status !== 200) {
    throw new Error(`owner login failed: ${login.status} ${JSON.stringify(login.body)}`)
  }
  const accessToken = login.body.data.accessToken as string
  return {
    user: { id: login.body.data.user.id, phone, role: Role.OWNER, name },
    accessToken,
    bearer: `Bearer ${accessToken}`,
  }
}

/** Logs in the seeded admin user (phone +919900000000). */
export async function loginSeededAdmin(app: Express): Promise<AuthedCaller> {
  const res = await postJson(app, "/v1/auth/login", {
    phone: SEED_ADMIN_PHONE,
    password: PASSWORD,
  })
  if (res.status !== 200) {
    throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  const accessToken = res.body.data.accessToken as string
  return {
    user: {
      id: res.body.data.user.id,
      phone: SEED_ADMIN_PHONE,
      role: Role.ADMIN,
      name: res.body.data.user.name,
    },
    accessToken,
    bearer: `Bearer ${accessToken}`,
  }
}

// --- Cleanup ------------------------------------------------------------

/**
 * Removes everything this test run created. Order matters because of FK
 * Restrict relationships (Category ← Product, User ← Store etc.). Cascades
 * handle the rest.
 */
export async function cleanupRun(): Promise<void> {
  // Phone-prefixed users → their stores → their products cascade via Store
  // onDelete: Cascade and Product onDelete: Cascade. Categories created by
  // tests are separate; clean them by name prefix.
  await prisma.user.deleteMany({ where: { phone: { startsWith: PREFIX } } })

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

/**
 * Phase 6.5 integration tests — auth via better-auth.
 *
 * Exercises the full session lifecycle against the real Neon DB:
 *   sign-up/email     → 200 + session cookie
 *   sign-in/email     → 200 + session cookie
 *   get-session       → returns user (incl. our additional fields)
 *   sign-out          → clears the session row + cookie
 *
 * Plus the load-bearing edge cases:
 *   - OWNER signup lands isApproved=false → session.create hook blocks login
 *   - Admin can flip isApproved=true → owner can then sign in
 *   - ADMIN role on signup is rejected via the user.create hook
 *   - Duplicate email rejected by better-auth's unique check
 *   - Duplicate phone rejected by our DB-level unique constraint
 *   - Invalid phone shape rejected by the user.create hook
 *   - Session cookie survives a fresh `request(app)` call (mimics page reload)
 */

import { afterAll, describe, expect, it } from "vitest"
import request from "supertest"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/db/prisma.js"
import {
  cleanupRun,
  loginSeededAdmin,
  nextEmail,
  nextPhone,
  signupApprovedOwner,
  signupCustomer,
} from "./helpers/factories.js"

const PASSWORD = "Password123!"

const app = buildApp()
const api = () => request(app)

afterAll(async () => {
  await cleanupRun()
  await prisma.$disconnect()
})

// --- Cookie helpers ----------------------------------------------------

function setCookies(res: request.Response): string[] {
  const sc = res.headers["set-cookie"]
  if (Array.isArray(sc)) return sc
  if (typeof sc === "string") return [sc]
  return []
}

function cookieHeaderFrom(res: request.Response): string {
  return setCookies(res)
    .map((c) => c.split(";")[0])
    .filter((c): c is string => c !== undefined && c.length > 0)
    .join("; ")
}

// --- POST /v1/auth/sign-up/email ---------------------------------------

describe("POST /v1/auth/sign-up/email", () => {
  it("CUSTOMER signup → 200 + session cookie + user returned", async () => {
    const email = nextEmail("c")
    const phone = nextPhone()
    const res = await api()
      .post("/v1/auth/sign-up/email")
      .send({
        email,
        password: PASSWORD,
        name: "Cust Test",
        phone,
        role: "CUSTOMER",
      })
    expect(res.status).toBe(200)
    expect(res.body?.user?.email).toBe(email)
    expect(setCookies(res).some((c) => c.startsWith("kirana.session_token="))).toBe(true)
  })

  it("OWNER signup → user created with isApproved=false (session blocked until admin approves)", async () => {
    const email = nextEmail("o")
    const phone = nextPhone()
    const res = await api()
      .post("/v1/auth/sign-up/email")
      .send({
        email,
        password: PASSWORD,
        name: "Owner Test",
        phone,
        role: "OWNER",
      })
    // Better-auth tries to auto-sign-in (we have autoSignIn: true); our
    // session.create hook throws "Account is pending admin approval" for
    // an unapproved OWNER. Better-auth surfaces that as a non-2xx.
    expect(res.status).not.toBe(200)

    const created = await prisma.user.findUnique({ where: { email } })
    expect(created).not.toBeNull()
    expect(created!.role).toBe("OWNER")
    expect(created!.isApproved).toBe(false)
  })

  it("ADMIN signup → rejected (closed signup)", async () => {
    const email = nextEmail("a")
    const phone = nextPhone()
    const res = await api()
      .post("/v1/auth/sign-up/email")
      .send({
        email,
        password: PASSWORD,
        name: "Admin Attempt",
        phone,
        role: "ADMIN",
      })
    expect(res.status).not.toBe(200)
    const created = await prisma.user.findUnique({ where: { email } })
    expect(created).toBeNull()
  })

  it("Duplicate email → rejected", async () => {
    const email = nextEmail("dup")
    const first = await api().post("/v1/auth/sign-up/email").send({
      email,
      password: PASSWORD,
      name: "First",
      phone: nextPhone(),
      role: "CUSTOMER",
    })
    expect(first.status).toBe(200)
    const second = await api().post("/v1/auth/sign-up/email").send({
      email,
      password: PASSWORD,
      name: "Second",
      phone: nextPhone(),
      role: "CUSTOMER",
    })
    expect(second.status).not.toBe(200)
  })

  it("Duplicate phone → rejected (DB-level unique)", async () => {
    const phone = nextPhone()
    const first = await api().post("/v1/auth/sign-up/email").send({
      email: nextEmail("p1"),
      password: PASSWORD,
      name: "Phone First",
      phone,
      role: "CUSTOMER",
    })
    expect(first.status).toBe(200)
    const second = await api().post("/v1/auth/sign-up/email").send({
      email: nextEmail("p2"),
      password: PASSWORD,
      name: "Phone Second",
      phone, // duplicate
      role: "CUSTOMER",
    })
    expect(second.status).not.toBe(200)
  })

  it("Invalid phone shape → rejected by user.create hook", async () => {
    const res = await api().post("/v1/auth/sign-up/email").send({
      email: nextEmail("bad"),
      password: PASSWORD,
      name: "Bad Phone",
      phone: "abc", // not phone-like
      role: "CUSTOMER",
    })
    expect(res.status).not.toBe(200)
  })
})

// --- POST /v1/auth/sign-in/email ---------------------------------------

describe("POST /v1/auth/sign-in/email", () => {
  it("Seeded admin login → 200 + session cookie", async () => {
    const res = await api()
      .post("/v1/auth/sign-in/email")
      .send({ email: "admin@kirana.local", password: PASSWORD })
    expect(res.status).toBe(200)
    expect(setCookies(res).some((c) => c.startsWith("kirana.session_token="))).toBe(true)
  })

  it("Wrong password → rejected", async () => {
    const res = await api()
      .post("/v1/auth/sign-in/email")
      .send({ email: "admin@kirana.local", password: "wrong-password!" })
    expect(res.status).not.toBe(200)
  })

  it("Owner login BEFORE approval → rejected (pending-approval hook)", async () => {
    // Sign up an owner; do NOT flip isApproved.
    const email = nextEmail("pending")
    const phone = nextPhone()
    await api().post("/v1/auth/sign-up/email").send({
      email,
      password: PASSWORD,
      name: "Pending Owner",
      phone,
      role: "OWNER",
    })
    const login = await api()
      .post("/v1/auth/sign-in/email")
      .send({ email, password: PASSWORD })
    expect(login.status).not.toBe(200)
  })

  it("Owner login AFTER approval → 200 + session cookie", async () => {
    const email = nextEmail("approved")
    const phone = nextPhone()
    await api().post("/v1/auth/sign-up/email").send({
      email,
      password: PASSWORD,
      name: "Approved Owner",
      phone,
      role: "OWNER",
    })
    await prisma.user.update({
      where: { email },
      data: { isApproved: true, approvedAt: new Date() },
    })
    const login = await api()
      .post("/v1/auth/sign-in/email")
      .send({ email, password: PASSWORD })
    expect(login.status).toBe(200)
    expect(setCookies(login).some((c) => c.startsWith("kirana.session_token="))).toBe(true)
  })
})

// --- GET /v1/auth/get-session -------------------------------------------

describe("GET /v1/auth/get-session", () => {
  it("Returns user (with additional fields) when cookie is present", async () => {
    const customer = await signupCustomer(app)
    const res = await api().get("/v1/auth/get-session").set("Cookie", customer.cookieHeader)
    expect(res.status).toBe(200)
    expect(res.body?.user?.id).toBe(customer.user.id)
    expect(res.body?.user?.role).toBe("CUSTOMER")
    expect(res.body?.user?.phone).toBe(customer.user.phone)
    expect(res.body?.user?.isApproved).toBe(true)
  })

  it("Returns null/empty when no cookie present", async () => {
    const res = await api().get("/v1/auth/get-session")
    // Better-auth returns 200 with null body when no session — accepting both.
    expect(res.status).toBe(200)
    expect(res.body == null || res.body.user == null).toBe(true)
  })

  it("Session cookie survives a FRESH request — refresh-on-reload bug fix", async () => {
    // This is the headline bug we're fixing in Phase 6.5. A single sign-in
    // → a freshly-constructed supertest request → get-session must succeed.
    const customer = await signupCustomer(app)

    // Brand new supertest instance, just like the FE would after a tab reload.
    const fresh = request(app)
    const res = await fresh.get("/v1/auth/get-session").set("Cookie", customer.cookieHeader)
    expect(res.status).toBe(200)
    expect(res.body?.user?.id).toBe(customer.user.id)
  })
})

// --- POST /v1/auth/sign-out ---------------------------------------------

describe("POST /v1/auth/sign-out", () => {
  it("Clears the session row + emits cleared cookies on the response", async () => {
    const customer = await signupCustomer(app)

    const before = await prisma.session.count({ where: { userId: customer.user.id } })
    expect(before).toBeGreaterThanOrEqual(1)

    const out = await api()
      .post("/v1/auth/sign-out")
      .set("Cookie", customer.cookieHeader)
    expect(out.status).toBe(200)

    // The DB row goes away immediately.
    const after = await prisma.session.count({ where: { userId: customer.user.id } })
    expect(after).toBe(0)

    // The sign-out response returns Set-Cookie headers with Max-Age=0
    // (the browser-side mechanism that clears the cookie). We can't test
    // "subsequent requests fail" by replaying the OLD cookie header here
    // because the 5-min cookieCache (the session_data shadow cookie) is
    // still valid until its TTL — a real browser honours the Max-Age=0
    // and stops sending the cookie; supertest doesn't model that.
    const cleared = setCookies(out).filter((c) => c.includes("Max-Age=0"))
    expect(cleared.length).toBeGreaterThanOrEqual(1)
  })
})

// --- Cookie-protected route integration --------------------------------

describe("Auth cookie protects /v1/* routes", () => {
  it("Anonymous → 401 on /v1/addresses", async () => {
    const res = await api().get("/v1/addresses")
    expect(res.status).toBe(401)
  })

  it("Customer cookie → 200 on /v1/addresses", async () => {
    const customer = await signupCustomer(app)
    const res = await api().get("/v1/addresses").set("Cookie", customer.cookieHeader)
    expect(res.status).toBe(200)
  })

  it("Approved owner cookie → 200 on /v1/stores/me (404 STORE_NOT_CREATED until they POST)", async () => {
    const owner = await signupApprovedOwner(app)
    const res = await api().get("/v1/stores/me").set("Cookie", owner.cookieHeader)
    expect([200, 404]).toContain(res.status)
    if (res.status === 404) {
      expect(res.body.error.code).toBe("STORE_NOT_CREATED")
    }
  })

  it("Admin cookie → 200 on /v1/admin/users/pending-owners", async () => {
    const admin = await loginSeededAdmin(app)
    const res = await api()
      .get("/v1/admin/users/pending-owners")
      .set("Cookie", admin.cookieHeader)
    expect(res.status).toBe(200)
  })
})

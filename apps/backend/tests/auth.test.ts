/**
 * Phase 3 integration tests — exercises the full auth pipeline against the
 * real Neon DB. Sequenced; uses a per-run phone prefix so the seed dataset
 * stays intact.
 */

import { afterAll, describe, expect, it } from "vitest"
import request from "supertest"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/db/prisma.js"
import { cleanupRun, nextPhone } from "./helpers/factories.js"

const PASSWORD = "Password123!"
const SEED_ADMIN_PHONE = "+919900000000"

const app = buildApp()
const api = () => request(app)

afterAll(async () => {
  await cleanupRun()
  await prisma.$disconnect()
})

// --- Cookie + CSRF helpers ----------------------------------------------

function setCookies(res: request.Response): string[] {
  const sc = res.headers["set-cookie"]
  if (Array.isArray(sc)) return sc
  if (typeof sc === "string") return [sc]
  return []
}

function findCookie(res: request.Response, name: string): string | undefined {
  return setCookies(res).find((c) => c.startsWith(`${name}=`))
}

function refreshCookieValue(setCookie: string): string {
  const part = setCookie.split(";")[0]!
  return part.slice(part.indexOf("=") + 1)
}

/**
 * Build the Cookie header that a real browser would send to the API — both
 * the refresh cookie and the CSRF cookie. The header echo of the CSRF token
 * goes in `X-Csrf-Token` separately.
 */
function buildCookieHeader(res: request.Response): {
  cookie: string
  csrfToken: string | undefined
} {
  const cookies = setCookies(res)
  const pairs = cookies.map((c) => c.split(";")[0]!)
  const csrfPair = pairs.find((p) => p.startsWith("kirana_csrf="))
  const csrfToken = csrfPair === undefined ? undefined : csrfPair.slice("kirana_csrf=".length)
  return { cookie: pairs.join("; "), csrfToken }
}

// --- Tests --------------------------------------------------------------

describe("POST /v1/auth/signup", () => {
  it("creates a CUSTOMER, returns tokens, sets refresh + csrf cookies", async () => {
    const phone = nextPhone()
    const res = await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "Test Customer", role: "CUSTOMER" })

    expect(res.status).toBe(201)
    expect(res.body.data.user).toMatchObject({
      phone,
      role: "CUSTOMER",
      isApproved: true,
      name: "Test Customer",
    })
    expect(typeof res.body.data.accessToken).toBe("string")
    expect(typeof res.body.data.csrfToken).toBe("string")
    expect(res.body.data.expiresInSeconds).toBeGreaterThan(0)

    const rt = findCookie(res, "kirana_rt")
    const csrf = findCookie(res, "kirana_csrf")
    expect(rt).toBeDefined()
    expect(csrf).toBeDefined()
    expect(rt).toMatch(/HttpOnly/i)
    expect(rt).toMatch(/Path=\/v1\/auth/i)
    // CSRF cookie is intentionally readable from JS — must NOT be HttpOnly.
    expect(csrf).not.toMatch(/HttpOnly/i)
  })

  it("creates an OWNER as pending — no tokens, no cookies", async () => {
    const phone = nextPhone()
    const res = await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "Test Owner", role: "OWNER" })

    expect(res.status).toBe(201)
    expect(res.body.data.user).toMatchObject({
      phone,
      role: "OWNER",
      isApproved: false,
    })
    expect(res.body.data.pendingApproval).toBe(true)
    expect(res.body.data.accessToken).toBeUndefined()
    expect(findCookie(res, "kirana_rt")).toBeUndefined()
    expect(findCookie(res, "kirana_csrf")).toBeUndefined()
  })

  it("rejects an ADMIN-role signup attempt", async () => {
    const res = await api()
      .post("/v1/auth/signup")
      .send({ phone: nextPhone(), password: PASSWORD, name: "Sneaky", role: "ADMIN" })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
  })

  it("rejects duplicate phone (regardless of role)", async () => {
    const phone = nextPhone()
    const first = await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "First", role: "CUSTOMER" })
    expect(first.status).toBe(201)

    const dupe = await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "Second", role: "OWNER" })
    expect(dupe.status).toBe(409)
    expect(dupe.body.error.code).toBe("CONFLICT")
  })

  it("normalizes phone — formatted vs unformatted match", async () => {
    const phone = nextPhone()
    const formatted = phone.replace(/^(\+\d{2})(\d{2})(\d{4})(\d+)$/, "$1 $2-$3 $4")
    await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "Norm A", role: "CUSTOMER" })

    const dupe = await api()
      .post("/v1/auth/signup")
      .send({ phone: formatted, password: PASSWORD, name: "Norm B", role: "CUSTOMER" })
    expect(dupe.status).toBe(409)
  })
})

describe("POST /v1/auth/login", () => {
  it("logs in a customer with the right password", async () => {
    const phone = nextPhone()
    await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "Login Tester", role: "CUSTOMER" })

    const res = await api().post("/v1/auth/login").send({ phone, password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.data.user.phone).toBe(phone)
    expect(typeof res.body.data.accessToken).toBe("string")
    expect(typeof res.body.data.csrfToken).toBe("string")
    expect(findCookie(res, "kirana_rt")).toBeDefined()
    expect(findCookie(res, "kirana_csrf")).toBeDefined()
  })

  it("returns 401 with the same error code for unknown phone vs wrong password", async () => {
    const phone = nextPhone()
    await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "Wrong Pw", role: "CUSTOMER" })

    const wrong = await api().post("/v1/auth/login").send({ phone, password: "wrong-pass-xx" })
    expect(wrong.status).toBe(401)
    expect(wrong.body.error.code).toBe("UNAUTHORIZED")

    const unknown = await api()
      .post("/v1/auth/login")
      .send({ phone: nextPhone(), password: "whatever" })
    expect(unknown.status).toBe(401)
    expect(unknown.body.error.code).toBe("UNAUTHORIZED")
  })

  it("returns 403 for an unapproved owner trying to log in", async () => {
    const phone = nextPhone()
    await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "Pending Owner", role: "OWNER" })

    const res = await api().post("/v1/auth/login").send({ phone, password: PASSWORD })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe("FORBIDDEN")
  })
})

describe("POST /v1/auth/refresh", () => {
  it("rotates and returns a new access token + refresh + csrf cookies", async () => {
    const phone = nextPhone()
    const signup = await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "Refresh Tester", role: "CUSTOMER" })
    const { cookie, csrfToken } = buildCookieHeader(signup)

    const res = await api()
      .post("/v1/auth/refresh")
      .set("Cookie", cookie)
      .set("X-Csrf-Token", csrfToken!)
    expect(res.status).toBe(200)
    expect(typeof res.body.data.accessToken).toBe("string")
    const newRt = findCookie(res, "kirana_rt")
    const newCsrf = findCookie(res, "kirana_csrf")
    expect(newRt).toBeDefined()
    expect(newCsrf).toBeDefined()
    expect(newRt).not.toBe(findCookie(signup, "kirana_rt"))
  })

  it("returns 401 when no refresh cookie is sent", async () => {
    const res = await api().post("/v1/auth/refresh")
    expect(res.status).toBe(401)
  })

  it("returns 403 when CSRF header is missing (CSRF defense)", async () => {
    const phone = nextPhone()
    const signup = await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "CSRF Defense", role: "CUSTOMER" })
    const { cookie } = buildCookieHeader(signup)

    // Has refresh cookie + CSRF cookie, but no X-Csrf-Token header.
    const res = await api().post("/v1/auth/refresh").set("Cookie", cookie)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe("FORBIDDEN")
  })

  it("returns 403 when CSRF header doesn't match the cookie", async () => {
    const phone = nextPhone()
    const signup = await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "CSRF Mismatch", role: "CUSTOMER" })
    const { cookie } = buildCookieHeader(signup)

    const res = await api()
      .post("/v1/auth/refresh")
      .set("Cookie", cookie)
      .set("X-Csrf-Token", "not-the-right-token-aaaaaaaaaaaaaa")
    expect(res.status).toBe(403)
  })

  it("detects refresh-token reuse and revokes the chain (atomic)", async () => {
    const phone = nextPhone()
    const signup = await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "Reuse Detection", role: "CUSTOMER" })
    const { cookie: originalCookie, csrfToken: originalCsrf } = buildCookieHeader(signup)
    const originalRtCookie = findCookie(signup, "kirana_rt")!
    const originalRtValue = refreshCookieValue(originalRtCookie)

    // First rotation succeeds.
    const first = await api()
      .post("/v1/auth/refresh")
      .set("Cookie", originalCookie)
      .set("X-Csrf-Token", originalCsrf!)
    expect(first.status).toBe(200)
    const { cookie: rotatedCookie, csrfToken: rotatedCsrf } = buildCookieHeader(first)

    // Replaying the ORIGINAL refresh token — reuse → 401, family revoked.
    // Use the ROTATED CSRF cookie too so we pass the CSRF gate and test the
    // actual reuse-detection logic underneath.
    const replay = await api()
      .post("/v1/auth/refresh")
      .set("Cookie", rotatedCookie.replace(/kirana_rt=[^;]+/, `kirana_rt=${originalRtValue}`))
      .set("X-Csrf-Token", rotatedCsrf!)
    expect(replay.status).toBe(401)

    // The legitimate rotated token from `first` is now revoked (family).
    const aftermath = await api()
      .post("/v1/auth/refresh")
      .set("Cookie", rotatedCookie)
      .set("X-Csrf-Token", rotatedCsrf!)
    expect(aftermath.status).toBe(401)
  })

  it("rejects a garbage refresh token cookie", async () => {
    // Build a CSRF cookie + matching header so we get past the CSRF gate and
    // exercise the refresh-token lookup itself.
    const phone = nextPhone()
    const signup = await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "Garbage RT", role: "CUSTOMER" })
    const { csrfToken } = buildCookieHeader(signup)
    const csrfCookie = findCookie(signup, "kirana_csrf")!.split(";")[0]!

    const res = await api()
      .post("/v1/auth/refresh")
      .set("Cookie", `kirana_rt=nonsense_value_42; ${csrfCookie}`)
      .set("X-Csrf-Token", csrfToken!)
    expect(res.status).toBe(401)
  })
})

describe("POST /v1/auth/logout + GET /v1/auth/me", () => {
  it("logout clears cookies and revokes the chain; me requires a valid access token", async () => {
    const phone = nextPhone()
    const signup = await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "Logout Tester", role: "CUSTOMER" })
    const access = signup.body.data.accessToken as string
    const { cookie, csrfToken } = buildCookieHeader(signup)

    const meBefore = await api().get("/v1/auth/me").set("Authorization", `Bearer ${access}`)
    expect(meBefore.status).toBe(200)
    expect(meBefore.body.data.user.phone).toBe(phone)

    const logout = await api()
      .post("/v1/auth/logout")
      .set("Cookie", cookie)
      .set("X-Csrf-Token", csrfToken!)
    expect(logout.status).toBe(204)

    // Logged-out cookie chain is revoked.
    const refreshAfter = await api()
      .post("/v1/auth/refresh")
      .set("Cookie", cookie)
      .set("X-Csrf-Token", csrfToken!)
    expect(refreshAfter.status).toBe(401)

    const meNoAuth = await api().get("/v1/auth/me")
    expect(meNoAuth.status).toBe(401)
  })

  it("logout without any cookie is a no-op 204", async () => {
    const res = await api().post("/v1/auth/logout")
    expect(res.status).toBe(204)
  })

  it("logout with refresh cookie but no CSRF header is 403", async () => {
    const phone = nextPhone()
    const signup = await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "Logout CSRF", role: "CUSTOMER" })
    const rtCookie = findCookie(signup, "kirana_rt")!.split(";")[0]!

    // Only the refresh cookie, no CSRF anywhere — must be rejected.
    const res = await api().post("/v1/auth/logout").set("Cookie", rtCookie)
    expect(res.status).toBe(403)
  })
})

describe("Admin approval flow", () => {
  it("admin can list and approve a pending owner; owner can then log in", async () => {
    const ownerPhone = nextPhone()
    await api()
      .post("/v1/auth/signup")
      .send({ phone: ownerPhone, password: PASSWORD, name: "Approve Me", role: "OWNER" })

    const adminLogin = await api()
      .post("/v1/auth/login")
      .send({ phone: SEED_ADMIN_PHONE, password: PASSWORD })
    expect(adminLogin.status).toBe(200)
    const adminToken = adminLogin.body.data.accessToken as string

    const pending = await api()
      .get("/v1/admin/users/pending-owners")
      .set("Authorization", `Bearer ${adminToken}`)
    expect(pending.status).toBe(200)
    const target = (pending.body.data.owners as { id: string; phone: string }[]).find(
      (o) => o.phone === ownerPhone,
    )
    expect(target).toBeDefined()

    const approve = await api()
      .post(`/v1/admin/users/${target!.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
    expect(approve.status).toBe(200)
    expect(approve.body.data.owner.isApproved).toBe(true)

    const ownerLogin = await api()
      .post("/v1/auth/login")
      .send({ phone: ownerPhone, password: PASSWORD })
    expect(ownerLogin.status).toBe(200)
    expect(ownerLogin.body.data.user.role).toBe("OWNER")
  })

  it("non-admin cannot reach /v1/admin/*", async () => {
    const phone = nextPhone()
    const signup = await api()
      .post("/v1/auth/signup")
      .send({ phone, password: PASSWORD, name: "Just A Customer", role: "CUSTOMER" })
    const customerToken = signup.body.data.accessToken as string

    const res = await api()
      .get("/v1/admin/users/pending-owners")
      .set("Authorization", `Bearer ${customerToken}`)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe("FORBIDDEN")
  })

  it("approving a non-existent owner returns 404", async () => {
    const adminLogin = await api()
      .post("/v1/auth/login")
      .send({ phone: SEED_ADMIN_PHONE, password: PASSWORD })
    const adminToken = adminLogin.body.data.accessToken as string

    const res = await api()
      .post("/v1/admin/users/nonexistent-id-zzz/approve")
      .set("Authorization", `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("NOT_FOUND")
  })

  it("approving an already-approved owner returns 409", async () => {
    const ownerPhone = nextPhone()
    await api()
      .post("/v1/auth/signup")
      .send({ phone: ownerPhone, password: PASSWORD, name: "Approve Twice", role: "OWNER" })

    const adminLogin = await api()
      .post("/v1/auth/login")
      .send({ phone: SEED_ADMIN_PHONE, password: PASSWORD })
    const adminToken = adminLogin.body.data.accessToken as string

    const pending = await api()
      .get("/v1/admin/users/pending-owners")
      .set("Authorization", `Bearer ${adminToken}`)
    const target = (pending.body.data.owners as { id: string; phone: string }[]).find(
      (o) => o.phone === ownerPhone,
    )!

    await api()
      .post(`/v1/admin/users/${target.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
    const second = await api()
      .post(`/v1/admin/users/${target.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
    expect(second.status).toBe(409)
  })

  it("admin rejects a pending owner (row is deleted)", async () => {
    const ownerPhone = nextPhone()
    await api()
      .post("/v1/auth/signup")
      .send({ phone: ownerPhone, password: PASSWORD, name: "Reject Me", role: "OWNER" })

    const adminLogin = await api()
      .post("/v1/auth/login")
      .send({ phone: SEED_ADMIN_PHONE, password: PASSWORD })
    const adminToken = adminLogin.body.data.accessToken as string

    const pending = await api()
      .get("/v1/admin/users/pending-owners")
      .set("Authorization", `Bearer ${adminToken}`)
    const target = (pending.body.data.owners as { id: string; phone: string }[]).find(
      (o) => o.phone === ownerPhone,
    )!

    const res = await api()
      .post(`/v1/admin/users/${target.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
    expect(res.status).toBe(204)

    const loginAttempt = await api()
      .post("/v1/auth/login")
      .send({ phone: ownerPhone, password: PASSWORD })
    expect(loginAttempt.status).toBe(401)
  })
})

describe("CORS hard-reject", () => {
  it("rejects requests from a disallowed Origin with a typed error", async () => {
    const res = await api()
      .options("/v1/auth/login")
      .set("Origin", "http://attacker.example")
      .set("Access-Control-Request-Method", "POST")
    // The cors lib calls into our error handler; we wrap as 403.
    expect(res.status).toBe(403)
  })

  it("allows preflight from an allowed origin", async () => {
    const res = await api()
      .options("/v1/auth/login")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "POST")
    expect(res.status).toBeLessThan(400)
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000")
  })
})

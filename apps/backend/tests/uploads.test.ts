/**
 * Phase 6.7 — Cloudinary signed-upload signature endpoints.
 *
 * These tests verify the signature PAYLOAD SHAPE + the authorization gates.
 * They never upload to Cloudinary — the dummy creds in vitest.config.ts make
 * the endpoint "configured" so signUpload returns a well-formed payload signed
 * with a fake secret. End-to-end upload is manual smoke (real creds required).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import { buildApp } from "../src/app.js"
import {
  type AuthedCaller,
  cleanupRun,
  loginSeededAdmin,
  signupApprovedOwner,
  signupCustomer,
} from "./helpers/factories.js"

const app = buildApp()
const api = () => request(app)

let owner: AuthedCaller
let customer: AuthedCaller
let admin: AuthedCaller

beforeAll(async () => {
  // Deliberately do NOT create a store — the signature must work during
  // onboarding (before the store exists). The folder is scoped to the owner's
  // user id, not a store id.
  owner = await signupApprovedOwner(app, "Uploads Owner")
  customer = await signupCustomer(app, "Uploads Customer")
  admin = await loginSeededAdmin(app)
})

afterAll(async () => {
  await cleanupRun()
})

describe("POST /v1/uploads/signature (owner)", () => {
  it("returns a well-formed signed payload for scope=product", async () => {
    const res = await api()
      .post("/v1/uploads/signature")
      .set("Cookie", owner.cookieHeader)
      .send({ scope: "product" })
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.cloudName).toBe("test-cloud")
    expect(d.apiKey).toBe("test-key")
    expect(typeof d.timestamp).toBe("number")
    // SHA-1 hex digest.
    expect(d.signature).toMatch(/^[a-f0-9]{40}$/)
    // Folder is derived server-side from the caller's user id — no IDOR, and
    // no store required (works during onboarding).
    expect(d.folder).toBe(`products/${owner.user.id}`)
  })

  it("scopes the store folder to the caller (no store needed during onboarding)", async () => {
    const res = await api()
      .post("/v1/uploads/signature")
      .set("Cookie", owner.cookieHeader)
      .send({ scope: "store" })
    expect(res.status).toBe(200)
    expect(res.body.data.folder).toBe(`stores/${owner.user.id}`)
  })

  it("rejects an invalid scope with 400", async () => {
    const res = await api()
      .post("/v1/uploads/signature")
      .set("Cookie", owner.cookieHeader)
      .send({ scope: "not-a-scope" })
    expect(res.status).toBe(400)
  })

  it("rejects a customer with 403", async () => {
    const res = await api()
      .post("/v1/uploads/signature")
      .set("Cookie", customer.cookieHeader)
      .send({ scope: "product" })
    expect(res.status).toBe(403)
  })

  it("rejects an anonymous caller with 401", async () => {
    const res = await api().post("/v1/uploads/signature").send({ scope: "product" })
    expect(res.status).toBe(401)
  })
})

describe("POST /v1/admin/uploads/signature (admin)", () => {
  it("signs a global category-icon folder", async () => {
    const res = await api()
      .post("/v1/admin/uploads/signature")
      .set("Cookie", admin.cookieHeader)
      .send({ scope: "category" })
    expect(res.status).toBe(200)
    expect(res.body.data.folder).toBe("categories")
    expect(res.body.data.signature).toMatch(/^[a-f0-9]{40}$/)
  })

  it("rejects an owner from the admin signature route with 403", async () => {
    const res = await api()
      .post("/v1/admin/uploads/signature")
      .set("Cookie", owner.cookieHeader)
      .send({ scope: "category" })
    expect(res.status).toBe(403)
  })
})

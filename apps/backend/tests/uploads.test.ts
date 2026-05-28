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
import { prisma } from "../src/db/prisma.js"
import {
  type AuthedCaller,
  cleanupRun,
  loginSeededAdmin,
  signupApprovedOwner,
  signupCustomer,
} from "./helpers/factories.js"

const app = buildApp()
const api = () => request(app)

const baseStoreBody = {
  name: "Uploads Test Store",
  phone: "+919999222222",
  latitude: 12.9116,
  longitude: 77.6473,
  addressLine: "addr",
  city: "Bengaluru",
  pincode: "560102",
}

let owner: AuthedCaller
let ownerStoreId: string
let customer: AuthedCaller
let admin: AuthedCaller

beforeAll(async () => {
  owner = await signupApprovedOwner(app, "Uploads Owner")
  await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send(baseStoreBody)
  const store = await prisma.store.findUniqueOrThrow({
    where: { ownerId: owner.user.id },
    select: { id: true },
  })
  ownerStoreId = store.id
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
    // Folder is derived server-side from the caller's OWN store — no IDOR.
    expect(d.folder).toBe(`products/${ownerStoreId}`)
  })

  it("scopes the store folder to the caller's own store", async () => {
    const res = await api()
      .post("/v1/uploads/signature")
      .set("Cookie", owner.cookieHeader)
      .send({ scope: "store" })
    expect(res.status).toBe(200)
    expect(res.body.data.folder).toBe(`stores/${ownerStoreId}`)
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

/**
 * Phase 4.1 integration tests — owner-side store CRUD.
 *
 * Hits the real Neon DB. Per-run phone prefix keeps the seed dataset intact;
 * cleanupRun() drops the test rows in afterAll.
 */

import { afterAll, describe, expect, it } from "vitest"
import request from "supertest"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/db/prisma.js"
import {
  cleanupRun,
  signupApprovedOwner,
  signupCustomer,
  loginSeededAdmin,
} from "./helpers/factories.js"

const app = buildApp()
const api = () => request(app)

afterAll(async () => {
  await cleanupRun()
  await prisma.$disconnect()
})

const baseStoreBody = {
  name: "Test Kirana",
  description: "Friendly neighbourhood store.",
  phone: "+919999000001",
  latitude: 12.9116,
  longitude: 77.6473,
  deliveryRadiusMeters: 3000,
  minOrderPaise: 9900,
  addressLine: "Test address line",
  city: "Bengaluru",
  pincode: "560102",
}

describe("POST /v1/stores/me", () => {
  it("approved owner creates their store; defaults isOpen=false", async () => {
    const owner = await signupApprovedOwner(app)
    const res = await api()
      .post("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send(baseStoreBody)

    expect(res.status).toBe(201)
    const store = res.body.data.store
    expect(store).toMatchObject({
      ownerId: owner.user.id,
      name: baseStoreBody.name,
      isActive: true,
      isOpen: false,
      city: "Bengaluru",
      pincode: "560102",
    })
    expect(typeof store.id).toBe("string")
    // Decimal serialization → string
    expect(typeof store.latitude).toBe("string")
    expect(typeof store.longitude).toBe("string")
  })

  it("second create attempt returns 409", async () => {
    const owner = await signupApprovedOwner(app)
    const first = await api()
      .post("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send(baseStoreBody)
    expect(first.status).toBe(201)

    const second = await api()
      .post("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseStoreBody, name: "Different name" })
    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe("CONFLICT")
  })

  it("normalizes the phone on save", async () => {
    const owner = await signupApprovedOwner(app)
    const formatted = "+91 99990 00099"
    const res = await api()
      .post("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseStoreBody, phone: formatted })
    expect(res.status).toBe(201)
    expect(res.body.data.store.phone).toBe("+919999000099")
  })

  it("rejects invalid latitude", async () => {
    const owner = await signupApprovedOwner(app)
    const res = await api()
      .post("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseStoreBody, latitude: 99 })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
  })

  it("rejects deliveryRadiusMeters below 500", async () => {
    const owner = await signupApprovedOwner(app)
    const res = await api()
      .post("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseStoreBody, deliveryRadiusMeters: 100 })
    expect(res.status).toBe(400)
  })

  it("rejects unknown fields (strict object)", async () => {
    const owner = await signupApprovedOwner(app)
    const res = await api()
      .post("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseStoreBody, mysteryField: 42 })
    expect(res.status).toBe(400)
  })

  it("customer is denied (403)", async () => {
    const customer = await signupCustomer(app)
    const res = await api()
      .post("/v1/stores/me")
      .set("Cookie", customer.cookieHeader)
      .send(baseStoreBody)
    expect(res.status).toBe(403)
  })

  it("admin is denied (403) — /stores/me is OWNER-only", async () => {
    const admin = await loginSeededAdmin(app)
    const res = await api()
      .post("/v1/stores/me")
      .set("Cookie", admin.cookieHeader)
      .send(baseStoreBody)
    expect(res.status).toBe(403)
  })

  it("anonymous is denied (401)", async () => {
    const res = await api().post("/v1/stores/me").send(baseStoreBody)
    expect(res.status).toBe(401)
  })
})

describe("GET /v1/stores/me", () => {
  it("returns the caller's store", async () => {
    const owner = await signupApprovedOwner(app)
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send(baseStoreBody)
    const res = await api().get("/v1/stores/me").set("Cookie", owner.cookieHeader)
    expect(res.status).toBe(200)
    expect(res.body.data.store.ownerId).toBe(owner.user.id)
  })

  it("returns 404 STORE_NOT_CREATED before creation", async () => {
    const owner = await signupApprovedOwner(app)
    const res = await api().get("/v1/stores/me").set("Cookie", owner.cookieHeader)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("STORE_NOT_CREATED")
  })

  it("owner B never sees owner A's store", async () => {
    const ownerA = await signupApprovedOwner(app, "Owner A")
    await api().post("/v1/stores/me").set("Cookie", ownerA.cookieHeader).send({
      ...baseStoreBody,
      phone: "+919999000111",
    })
    const ownerB = await signupApprovedOwner(app, "Owner B")
    const res = await api().get("/v1/stores/me").set("Cookie", ownerB.cookieHeader)
    expect(res.status).toBe(404)
  })
})

describe("PATCH /v1/stores/me", () => {
  it("partial update of name + minOrderPaise", async () => {
    const owner = await signupApprovedOwner(app)
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send(baseStoreBody)

    const res = await api()
      .patch("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({ name: "Renamed Kirana", minOrderPaise: 14_900 })

    expect(res.status).toBe(200)
    expect(res.body.data.store.name).toBe("Renamed Kirana")
    expect(res.body.data.store.minOrderPaise).toBe(14_900)
    // Untouched field unchanged
    expect(res.body.data.store.city).toBe("Bengaluru")
  })

  it("clears description with null", async () => {
    const owner = await signupApprovedOwner(app)
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send(baseStoreBody)
    const res = await api()
      .patch("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({ description: null })
    expect(res.status).toBe(200)
    expect(res.body.data.store.description).toBeNull()
  })

  it("rejects latitude without longitude (must move together)", async () => {
    const owner = await signupApprovedOwner(app)
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send(baseStoreBody)
    const res = await api()
      .patch("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({ latitude: 13.0 })
    expect(res.status).toBe(400)
  })

  it("updating lat/lng refreshes the PostGIS location column", async () => {
    const owner = await signupApprovedOwner(app)
    const create = await api()
      .post("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send(baseStoreBody)
    const storeId = create.body.data.store.id

    await api()
      .patch("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({ latitude: 12.95, longitude: 77.55 })

    const rows = await prisma.$queryRaw<{ wkt: string | null }[]>`
      SELECT ST_AsText(location) AS wkt FROM "Store" WHERE id = ${storeId}
    `
    expect(rows[0]?.wkt).toBe("POINT(77.55 12.95)")
  })

  it("404 before store exists", async () => {
    const owner = await signupApprovedOwner(app)
    const res = await api()
      .patch("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({ name: "Anything" })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("STORE_NOT_CREATED")
  })
})

describe("PATCH /v1/stores/me/open", () => {
  it("toggle true → false → true round-trips", async () => {
    const owner = await signupApprovedOwner(app)
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send(baseStoreBody)

    const open = await api()
      .patch("/v1/stores/me/open")
      .set("Cookie", owner.cookieHeader)
      .send({ isOpen: true })
    expect(open.status).toBe(200)
    expect(open.body.data.store.isOpen).toBe(true)

    const close = await api()
      .patch("/v1/stores/me/open")
      .set("Cookie", owner.cookieHeader)
      .send({ isOpen: false })
    expect(close.body.data.store.isOpen).toBe(false)

    const reopen = await api()
      .patch("/v1/stores/me/open")
      .set("Cookie", owner.cookieHeader)
      .send({ isOpen: true })
    expect(reopen.body.data.store.isOpen).toBe(true)
  })

  it("idempotent: same value twice both return 200", async () => {
    const owner = await signupApprovedOwner(app)
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send(baseStoreBody)
    const first = await api()
      .patch("/v1/stores/me/open")
      .set("Cookie", owner.cookieHeader)
      .send({ isOpen: true })
    expect(first.status).toBe(200)
    const second = await api()
      .patch("/v1/stores/me/open")
      .set("Cookie", owner.cookieHeader)
      .send({ isOpen: true })
    expect(second.status).toBe(200)
    expect(second.body.data.store.isOpen).toBe(true)
  })

  it("404 STORE_NOT_CREATED before store exists", async () => {
    const owner = await signupApprovedOwner(app)
    const res = await api()
      .patch("/v1/stores/me/open")
      .set("Cookie", owner.cookieHeader)
      .send({ isOpen: true })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("STORE_NOT_CREATED")
  })

  it("rejects unknown field", async () => {
    const owner = await signupApprovedOwner(app)
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send(baseStoreBody)
    const res = await api()
      .patch("/v1/stores/me/open")
      .set("Cookie", owner.cookieHeader)
      .send({ isOpen: true, weird: 1 })
    expect(res.status).toBe(400)
  })
})

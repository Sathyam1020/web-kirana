/**
 * Phase 6.8 — store promotional banners (owner CRUD + one-active invariant +
 * public exposure on store detail + authz).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/db/prisma.js"
import {
  type AuthedCaller,
  cleanupRun,
  signupApprovedOwner,
  signupCustomer,
} from "./helpers/factories.js"

const app = buildApp()
const api = () => request(app)

const baseStoreBody = {
  name: "Banners Test Store",
  phone: "+919999333333",
  latitude: 12.9116,
  longitude: 77.6473,
  addressLine: "addr",
  city: "Bengaluru",
  pincode: "560102",
}

let owner: AuthedCaller
let storeId: string
let customer: AuthedCaller

const IMG = "https://res.cloudinary.com/demo/image/upload/sample.jpg"

beforeAll(async () => {
  owner = await signupApprovedOwner(app, "Banners Owner")
  await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send(baseStoreBody)
  const store = await prisma.store.findUniqueOrThrow({
    where: { ownerId: owner.user.id },
    select: { id: true },
  })
  storeId = store.id
  customer = await signupCustomer(app, "Banners Customer")
})

afterAll(async () => {
  await cleanupRun()
})

async function createBanner(name: string): Promise<string> {
  const res = await api()
    .post("/v1/stores/me/banners")
    .set("Cookie", owner.cookieHeader)
    .send({ name, imageUrl: IMG })
  expect(res.status).toBe(201)
  return res.body.data.banner.id as string
}

describe("owner banner CRUD", () => {
  it("creates a banner (inactive by default)", async () => {
    const res = await api()
      .post("/v1/stores/me/banners")
      .set("Cookie", owner.cookieHeader)
      .send({ name: "Launch sale", imageUrl: IMG })
    expect(res.status).toBe(201)
    expect(res.body.data.banner.name).toBe("Launch sale")
    expect(res.body.data.banner.isActive).toBe(false)
  })

  it("rejects a customer (403) and anon (401)", async () => {
    const asCustomer = await api()
      .post("/v1/stores/me/banners")
      .set("Cookie", customer.cookieHeader)
      .send({ name: "x", imageUrl: IMG })
    expect(asCustomer.status).toBe(403)
    const anon = await api().post("/v1/stores/me/banners").send({ name: "x", imageUrl: IMG })
    expect(anon.status).toBe(401)
  })

  it("keeps exactly one banner active and exposes it on store detail", async () => {
    const b1 = await createBanner("Diwali 50% off")
    const b2 = await createBanner("Weekend combo")

    // Activate b1.
    await api()
      .patch("/v1/stores/me/banners/active")
      .set("Cookie", owner.cookieHeader)
      .send({ bannerId: b1 })
    let detail = await api().get(`/v1/stores/${storeId}`)
    expect(detail.body.data.activeBanner?.id).toBe(b1)

    // Activating b2 must deactivate b1 (one-active invariant).
    const res = await api()
      .patch("/v1/stores/me/banners/active")
      .set("Cookie", owner.cookieHeader)
      .send({ bannerId: b2 })
    expect(res.status).toBe(200)
    const activeCount = (res.body.data.banners as { isActive: boolean }[]).filter(
      (b) => b.isActive,
    ).length
    expect(activeCount).toBe(1)
    detail = await api().get(`/v1/stores/${storeId}`)
    expect(detail.body.data.activeBanner?.id).toBe(b2)

    // Hide the banner (null) → store detail shows none.
    await api()
      .patch("/v1/stores/me/banners/active")
      .set("Cookie", owner.cookieHeader)
      .send({ bannerId: null })
    detail = await api().get(`/v1/stores/${storeId}`)
    expect(detail.body.data.activeBanner).toBeNull()
  })

  it("deletes a banner; cross-store delete 404s", async () => {
    const id = await createBanner("Temp")
    // Another owner can't delete it.
    const other = await signupApprovedOwner(app, "Other Owner")
    await api().post("/v1/stores/me").set("Cookie", other.cookieHeader).send({
      ...baseStoreBody,
      name: "Other Store",
      phone: "+919999444444",
    })
    const crossDelete = await api()
      .delete(`/v1/stores/me/banners/${id}`)
      .set("Cookie", other.cookieHeader)
    expect(crossDelete.status).toBe(404)
    // Owner deletes their own.
    const ownDelete = await api()
      .delete(`/v1/stores/me/banners/${id}`)
      .set("Cookie", owner.cookieHeader)
    expect(ownDelete.status).toBe(200)
  })
})

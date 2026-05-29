/**
 * Phase 11 — scheduled-job logic (called directly; the scheduler itself is a
 * thin node-cron wrapper). Auto-cancel of stale PLACED orders, the opt-in daily
 * availability reset, and the WhatsApp retry no-op when unconfigured.
 * See PHASE11.md.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import request from "supertest"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/db/prisma.js"
import { autoCancelStalePlacedOrders } from "../src/modules/orders/orders.service.js"
import { resetAvailabilityForOptedInStores } from "../src/modules/stores/stores.service.js"
import { retryFailedWhatsApp } from "../src/notifications/providers/whatsapp.js"
import {
  type AuthedCaller,
  cleanupRun,
  ensureSubcategoryForOwner,
  signupApprovedOwner,
  signupCustomer,
} from "./helpers/factories.js"

const app = buildApp()
const api = () => request(app)

const STORE_LAT = 12.9116
const STORE_LNG = 77.6473

let categoryId: string
let owner: AuthedCaller
let storeId: string
let productA: string
let customer: AuthedCaller
let nearAddress: string

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow({ orderBy: { displayOrder: "asc" } })).id
  owner = await signupApprovedOwner(app, "Cron Owner")
  const storeRes = await api()
    .post("/v1/stores/me")
    .set("Cookie", owner.cookieHeader)
    .send({
      name: "Cron Store",
      phone: "+919994000001",
      latitude: STORE_LAT,
      longitude: STORE_LNG,
      addressLine: "addr",
      city: "Bengaluru",
      pincode: "560102",
    })
  storeId = storeRes.body.data.store.id
  await api().patch("/v1/stores/me/open").set("Cookie", owner.cookieHeader).send({ isOpen: true })
  const subId = await ensureSubcategoryForOwner(owner, categoryId)
  const p = await api()
    .post("/v1/stores/me/products")
    .set("Cookie", owner.cookieHeader)
    .send({ subcategoryId: subId, name: "Cron Item", pricePaise: 10000, unit: "PIECE" })
  productA = p.body.data.product.id
  customer = await signupCustomer(app, "Cron Customer")
  const a = await api()
    .post("/v1/addresses")
    .set("Cookie", customer.cookieHeader)
    .send({ label: "Home", line1: "1 St", city: "Bengaluru", pincode: "560102", latitude: STORE_LAT, longitude: STORE_LNG })
  nearAddress = a.body.data.address.id
})

afterAll(async () => {
  await cleanupRun()
})

async function freshOrder(): Promise<string> {
  const res = await api()
    .post("/v1/orders")
    .set("Cookie", customer.cookieHeader)
    .set("Idempotency-Key", randomUUID())
    .send({ addressId: nearAddress, cart: [{ productId: productA, quantity: 1 }] })
  expect(res.status).toBe(201)
  return res.body.data.order.id as string
}

function backdate(orderId: string, minutesAgo: number): Promise<unknown> {
  return prisma.order.update({
    where: { id: orderId },
    data: { placedAt: new Date(Date.now() - minutesAgo * 60_000) },
  })
}

describe("auto-cancel stale PLACED orders", () => {
  it("cancels a PLACED order older than the cutoff as SYSTEM", async () => {
    const id = await freshOrder()
    await backdate(id, 60)
    const count = await autoCancelStalePlacedOrders(new Date(Date.now() - 30 * 60_000))
    expect(count).toBeGreaterThanOrEqual(1)

    const order = await prisma.order.findUniqueOrThrow({ where: { id } })
    expect(order.status).toBe("CANCELLED")
    const sysHistory = await prisma.orderStatusHistory.count({
      where: { orderId: id, toStatus: "CANCELLED", actorType: "SYSTEM" },
    })
    expect(sysHistory).toBe(1)
  })

  it("leaves a recent PLACED order alone", async () => {
    const id = await freshOrder() // placedAt = now
    await autoCancelStalePlacedOrders(new Date(Date.now() - 30 * 60_000))
    const order = await prisma.order.findUniqueOrThrow({ where: { id } })
    expect(order.status).toBe("PLACED")
  })

  it("doesn't touch an already-accepted order even if old", async () => {
    const id = await freshOrder()
    await api().post(`/v1/stores/me/orders/${id}/accept`).set("Cookie", owner.cookieHeader)
    await backdate(id, 60)
    await autoCancelStalePlacedOrders(new Date(Date.now() - 30 * 60_000))
    const order = await prisma.order.findUniqueOrThrow({ where: { id } })
    expect(order.status).toBe("ACCEPTED")
  })
})

describe("opt-in daily availability reset", () => {
  it("re-enables products only when the store opted in", async () => {
    await prisma.product.update({ where: { id: productA }, data: { isAvailable: false } })

    // Opted out → untouched.
    await prisma.store.update({ where: { id: storeId }, data: { autoResetAvailability: false } })
    await resetAvailabilityForOptedInStores()
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productA } })).isAvailable).toBe(
      false,
    )

    // Opted in → re-enabled.
    await prisma.store.update({ where: { id: storeId }, data: { autoResetAvailability: true } })
    const res = await resetAvailabilityForOptedInStores()
    expect(res.products).toBeGreaterThanOrEqual(1)
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productA } })).isAvailable).toBe(
      true,
    )
  })
})

describe("whatsapp retry", () => {
  it("no-ops when WhatsApp is unconfigured", async () => {
    expect(await retryFailedWhatsApp()).toBe(0)
  })
})

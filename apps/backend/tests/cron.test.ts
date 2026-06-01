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
import {
  autoOpenCloseStores,
  isInsideHours,
  resetAvailabilityForOptedInStores,
} from "../src/modules/stores/stores.service.js"
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

// ---------------------------------------------------------------------------
// IP-1 — auto-open / auto-close based on Store.openTime / closeTime.
// ---------------------------------------------------------------------------

describe("isInsideHours — pure window-membership predicate", () => {
  // Minutes-of-day fixtures
  const t07 = 7 * 60
  const t22 = 22 * 60
  const t12 = 12 * 60
  const t06 = 6 * 60
  const t23 = 23 * 60
  const t01 = 1 * 60
  const t02 = 2 * 60

  it("same-day window 07:00–22:00 is inside at 12:00 and outside at 06:00 / 22:00", () => {
    expect(isInsideHours(t12, t07, t22)).toBe(true)
    expect(isInsideHours(t06, t07, t22)).toBe(false)
    expect(isInsideHours(t22, t07, t22)).toBe(false) // [open, close) — close itself is OUTSIDE
    expect(isInsideHours(t07, t07, t22)).toBe(true)  // [open, close) — open itself is INSIDE
  })

  it("crossing-midnight window 21:00–01:00 is inside at 23:00 and outside at 02:00", () => {
    const t21 = 21 * 60
    expect(isInsideHours(t23, t21, t01)).toBe(true)  // after open, before midnight
    expect(isInsideHours(t02, t21, t01)).toBe(false) // after close, before open
    expect(isInsideHours(t12, t21, t01)).toBe(false)
    expect(isInsideHours(t21, t21, t01)).toBe(true)  // open itself
    expect(isInsideHours(t01, t21, t01)).toBe(false) // close itself
  })
})

describe("autoOpenCloseStores", () => {
  // The sweep scans every active not-manualClosed store in the test DB.
  // On shared Neon (accumulated stores across many test runs) one sweep
  // can take ~10–30s on per-row guarded updateMany. Bump the per-test
  // timeout so we don't false-fail on test-data scale. The prod cron
  // runs every 15 min so this latency is fine in production too.
  it("flips isOpen to match the IST window and skips manualClosed=true", { timeout: 120_000 }, async () => {
    // The shared cron-test store is the one we sweep. Set its hours to a
    // tight window AROUND a known fixed "now" so we exercise both branches
    // in one call without depending on real wall-clock time.
    //
    // We pick a "now" that is 12:00 IST regardless of when the test runs
    // (the service fn takes a Date arg). With hours 07:00–22:00 the store
    // SHOULD be open. With manualClosed=true it MUST stay closed.

    // 1. Window contains 12:00 IST — expect cron to OPEN the store.
    await prisma.store.update({
      where: { id: storeId },
      data: { isOpen: false, manualClosed: false, openTime: "07:00", closeTime: "22:00" },
    })
    // 06:30 UTC == 12:00 IST. Fixed instant lets the test be timezone-portable.
    const noonIst = new Date("2026-01-15T06:30:00.000Z")
    let res = await autoOpenCloseStores(noonIst)
    expect(res.opened).toBeGreaterThanOrEqual(1)
    expect((await prisma.store.findUniqueOrThrow({ where: { id: storeId } })).isOpen).toBe(true)

    // 2. Window does NOT contain 12:00 IST (00:00–05:00) — expect CLOSE.
    await prisma.store.update({
      where: { id: storeId },
      data: { openTime: "00:00", closeTime: "05:00" },
    })
    res = await autoOpenCloseStores(noonIst)
    expect(res.closed).toBeGreaterThanOrEqual(1)
    expect((await prisma.store.findUniqueOrThrow({ where: { id: storeId } })).isOpen).toBe(false)

    // 3. manualClosed=true — even when hours would open the store, cron
    //    skips it. Set hours that include noon IST, then verify isOpen
    //    stays false because manualClosed forces it out of the sweep set.
    await prisma.store.update({
      where: { id: storeId },
      data: { manualClosed: true, openTime: "07:00", closeTime: "22:00", isOpen: false },
    })
    await autoOpenCloseStores(noonIst)
    expect((await prisma.store.findUniqueOrThrow({ where: { id: storeId } })).isOpen).toBe(false)

    // Reset for the next describe block.
    await prisma.store.update({
      where: { id: storeId },
      data: { manualClosed: false, isOpen: true, openTime: "07:00", closeTime: "22:00" },
    })
  })

  it("crossing-midnight window: open=21:00 close=01:00 is open at 23:00 IST", { timeout: 120_000 }, async () => {
    await prisma.store.update({
      where: { id: storeId },
      data: { isOpen: false, manualClosed: false, openTime: "21:00", closeTime: "01:00" },
    })
    // 17:30 UTC == 23:00 IST.
    const elevenPmIst = new Date("2026-01-15T17:30:00.000Z")
    const res = await autoOpenCloseStores(elevenPmIst)
    expect(res.opened).toBeGreaterThanOrEqual(1)
    expect((await prisma.store.findUniqueOrThrow({ where: { id: storeId } })).isOpen).toBe(true)

    // 20:30 UTC == 02:00 IST (next day) — outside the 21:00–01:00 window.
    const twoAmIst = new Date("2026-01-15T20:30:00.000Z")
    const res2 = await autoOpenCloseStores(twoAmIst)
    expect(res2.closed).toBeGreaterThanOrEqual(1)
    expect((await prisma.store.findUniqueOrThrow({ where: { id: storeId } })).isOpen).toBe(false)

    // Reset for the next test.
    await prisma.store.update({
      where: { id: storeId },
      data: { openTime: "07:00", closeTime: "22:00", isOpen: true },
    })
  })
})

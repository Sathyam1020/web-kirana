/**
 * Phase 7 — order placement + reads. Covers idempotency, server-side
 * re-validation, coupon redemption/stacking, concurrency, read scoping, and
 * snapshot durability. See apps/backend/PHASE7.md.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import request from "supertest"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/db/prisma.js"
import {
  type AuthedCaller,
  cleanupRun,
  ensureSubcategoryForOwner,
  loginSeededAdmin,
  signupApprovedOwner,
  signupCustomer,
} from "./helpers/factories.js"

const app = buildApp()
const api = () => request(app)

// Per-run unique coupon codes so a previous (e.g. interrupted) run's leftover
// coupons never collide with this run's. All still share the T7- prefix so
// afterAll cleans them.
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase()
const COUPON_PCT = `T7-${RUN}A`
const COUPON_ONCE = `T7-${RUN}B`

// All test stores sit at the same Bengaluru point so the customer's "near"
// address is inside every store's default 3km radius.
const STORE_LAT = 12.9116
const STORE_LNG = 77.6473

let categoryId: string

async function newStore(opts: {
  phone: string
  open: boolean
  minOrderPaise?: number
  // IP-1 — opt-in extras for the fee-compute tests; default 0/0 preserves
  // legacy callers (no fee, no threshold) so existing tests don't move.
  baseDeliveryFeePaise?: number
  freeDeliveryThresholdPaise?: number
}): Promise<{ owner: AuthedCaller; storeId: string; subId: string }> {
  const owner = await signupApprovedOwner(app, "Order Owner")
  await api()
    .post("/v1/stores/me")
    .set("Cookie", owner.cookieHeader)
    .send({
      name: "Order Test Store",
      phone: opts.phone,
      latitude: STORE_LAT,
      longitude: STORE_LNG,
      addressLine: "addr",
      city: "Bengaluru",
      pincode: "560102",
      minOrderPaise: opts.minOrderPaise ?? 0,
      baseDeliveryFeePaise: opts.baseDeliveryFeePaise ?? 0,
      freeDeliveryThresholdPaise: opts.freeDeliveryThresholdPaise ?? 0,
    })
  if (opts.open) {
    await api().patch("/v1/stores/me/open").set("Cookie", owner.cookieHeader).send({ isOpen: true })
  }
  const store = await prisma.store.findUniqueOrThrow({
    where: { ownerId: owner.user.id },
    select: { id: true },
  })
  const subId = await ensureSubcategoryForOwner(owner, categoryId)
  return { owner, storeId: store.id, subId }
}

async function newProduct(
  owner: AuthedCaller,
  subId: string,
  pricePaise: number,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await api()
    .post("/v1/stores/me/products")
    .set("Cookie", owner.cookieHeader)
    .send({ subcategoryId: subId, name: "Order Item", pricePaise, unit: "PIECE", ...extra })
  expect(res.status).toBe(201)
  return res.body.data.product.id as string
}

async function addAddress(
  customer: AuthedCaller,
  lat: number,
  lng: number,
): Promise<string> {
  const res = await api()
    .post("/v1/addresses")
    .set("Cookie", customer.cookieHeader)
    .send({ label: "Home", line1: "1 Main St", city: "Bengaluru", pincode: "560102", latitude: lat, longitude: lng })
  expect(res.status).toBe(201)
  return res.body.data.address.id as string
}

function place(
  customer: AuthedCaller,
  body: Record<string, unknown>,
  key: string,
) {
  return api()
    .post("/v1/orders")
    .set("Cookie", customer.cookieHeader)
    .set("Idempotency-Key", key)
    .send(body)
}

// Shared happy-path fixtures.
let store: { owner: AuthedCaller; storeId: string; subId: string }
let productA: string // 10000 paise
let customer: AuthedCaller
let nearAddress: string

beforeAll(async () => {
  const cat = await prisma.category.findFirstOrThrow({ orderBy: { displayOrder: "asc" } })
  categoryId = cat.id
  store = await newStore({ phone: "+919990000001", open: true })
  productA = await newProduct(store.owner, store.subId, 10000)
  customer = await signupCustomer(app, "Order Customer")
  nearAddress = await addAddress(customer, STORE_LAT, STORE_LNG)
})

afterAll(async () => {
  // cleanupRun first: it deletes this run's test users, cascading their orders
  // and coupon redemptions — so the coupon delete below has no FK refs. Scope
  // the coupon delete to THIS run's codes (not all T7-) so a prior interrupted
  // run's leftovers can't make this afterAll throw.
  await cleanupRun()
  await prisma.coupon.deleteMany({ where: { code: { in: [COUPON_PCT, COUPON_ONCE] } } })
})

describe("POST /v1/orders — placement", () => {
  it("places an order with correct totals + snapshots", async () => {
    const res = await place(
      customer,
      { addressId: nearAddress, cart: [{ productId: productA, quantity: 2 }] },
      randomUUID(),
    )
    expect(res.status).toBe(201)
    const o = res.body.data.order
    expect(o.status).toBe("PLACED")
    expect(o.paymentMethod).toBe("COD")
    expect(o.itemsSubtotalPaise).toBe(20000)
    expect(o.totalPaise).toBe(20000)
    expect(o.items).toHaveLength(1)
    expect(o.items[0].quantity).toBe(2)
    expect(o.items[0].lineTotalPaise).toBe(20000)
    expect(o.store.nameSnapshot).toBe("Order Test Store")
    expect(o.delivery.label).toBe("Home")
  })

  it("is idempotent — same key + body returns the same order, no duplicate", async () => {
    const key = randomUUID()
    const body = { addressId: nearAddress, cart: [{ productId: productA, quantity: 1 }] }
    const first = await place(customer, body, key)
    const second = await place(customer, body, key)
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(second.body.data.order.id).toBe(first.body.data.order.id)
    const count = await prisma.order.count({ where: { id: first.body.data.order.id } })
    expect(count).toBe(1)
  })

  it("rejects the same key with a different body (409)", async () => {
    const key = randomUUID()
    await place(customer, { addressId: nearAddress, cart: [{ productId: productA, quantity: 1 }] }, key)
    const res = await place(customer, { addressId: nearAddress, cart: [{ productId: productA, quantity: 3 }] }, key)
    expect(res.status).toBe(409)
  })

  it("requires the Idempotency-Key header (400)", async () => {
    const res = await api()
      .post("/v1/orders")
      .set("Cookie", customer.cookieHeader)
      .send({ addressId: nearAddress, cart: [{ productId: productA, quantity: 1 }] })
    expect(res.status).toBe(400)
  })

  it("concurrent double-submit with one key creates exactly one order", async () => {
    const c = await signupCustomer(app, "Race Customer")
    const addr = await addAddress(c, STORE_LAT, STORE_LNG)
    const key = randomUUID()
    const body = { addressId: addr, cart: [{ productId: productA, quantity: 1 }] }
    const [r1, r2] = await Promise.all([place(c, body, key), place(c, body, key)])
    // At least one succeeds; the other is either a replay (201) or 409 in-progress.
    const statuses = [r1.status, r2.status].sort()
    expect(statuses).toContain(201)
    const count = await prisma.order.count({ where: { customerId: c.user.id } })
    expect(count).toBe(1)
  })
})

describe("POST /v1/orders — re-validation", () => {
  it("rejects an unavailable product (409 CART_CHANGED)", async () => {
    const pid = await newProduct(store.owner, store.subId, 5000)
    await api()
      .patch(`/v1/stores/me/products/${pid}`)
      .set("Cookie", store.owner.cookieHeader)
      .send({ isAvailable: false })
    const res = await place(customer, { addressId: nearAddress, cart: [{ productId: pid, quantity: 1 }] }, randomUUID())
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe("CART_CHANGED")
  })

  it("rejects a multi-store cart (400)", async () => {
    const other = await newStore({ phone: "+919990000002", open: true })
    const otherProduct = await newProduct(other.owner, other.subId, 5000)
    const res = await place(
      customer,
      { addressId: nearAddress, cart: [{ productId: productA, quantity: 1 }, { productId: otherProduct, quantity: 1 }] },
      randomUUID(),
    )
    expect(res.status).toBe(400)
  })

  it("rejects when the store is closed (409 STORE_CLOSED)", async () => {
    const closed = await newStore({ phone: "+919990000003", open: false })
    const p = await newProduct(closed.owner, closed.subId, 5000)
    const res = await place(customer, { addressId: nearAddress, cart: [{ productId: p, quantity: 1 }] }, randomUUID())
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe("STORE_CLOSED")
  })

  it("rejects below the store minimum order (400 MIN_ORDER_NOT_MET) with required + actual paise", async () => {
    const hi = await newStore({ phone: "+919990000004", open: true, minOrderPaise: 100000 })
    const p = await newProduct(hi.owner, hi.subId, 5000)
    const res = await place(customer, { addressId: nearAddress, cart: [{ productId: p, quantity: 1 }] }, randomUUID())
    // IP-1: typed MinOrderNotMetError replaces the previous CartChangedError
    // shim so the client can render "Add ₹X more" without recomputing.
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("MIN_ORDER_NOT_MET")
    expect(res.body.error.details).toMatchObject({ requiredPaise: 100000, actualPaise: 5000 })
  })

  it("rejects a delivery address outside the service area (422)", async () => {
    const farAddress = await addAddress(customer, 19.076, 72.877) // Mumbai
    const res = await place(customer, { addressId: farAddress, cart: [{ productId: productA, quantity: 1 }] }, randomUUID())
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe("OUT_OF_SERVICE_AREA")
  })

  // IP-1 — delivery fee snapshot at placement reflects the three branches
  // of computeDeliveryFeePaise (threshold=0 / below threshold / above).
  it("charges the base fee when freeDeliveryThresholdPaise=0 (no free tier offered)", async () => {
    const s = await newStore({
      phone: "+919990000010",
      open: true,
      baseDeliveryFeePaise: 3000,
      freeDeliveryThresholdPaise: 0,
    })
    const p = await newProduct(s.owner, s.subId, 5000)
    const res = await place(
      customer,
      { addressId: nearAddress, cart: [{ productId: p, quantity: 2 }] },
      randomUUID(),
    )
    expect(res.status).toBe(201)
    expect(res.body.data.order.deliveryFeePaise).toBe(3000)
    expect(res.body.data.order.totalPaise).toBe(10000 + 3000)
  })

  it("charges the base fee when subtotal is below freeDeliveryThresholdPaise", async () => {
    const s = await newStore({
      phone: "+919990000011",
      open: true,
      baseDeliveryFeePaise: 3000,
      freeDeliveryThresholdPaise: 20000,
    })
    const p = await newProduct(s.owner, s.subId, 5000)
    const res = await place(
      customer,
      { addressId: nearAddress, cart: [{ productId: p, quantity: 1 }] },
      randomUUID(),
    )
    expect(res.status).toBe(201)
    expect(res.body.data.order.deliveryFeePaise).toBe(3000)
    expect(res.body.data.order.totalPaise).toBe(5000 + 3000)
  })

  it("drops the fee to zero when subtotal >= freeDeliveryThresholdPaise", async () => {
    const s = await newStore({
      phone: "+919990000012",
      open: true,
      baseDeliveryFeePaise: 3000,
      freeDeliveryThresholdPaise: 20000,
    })
    const p = await newProduct(s.owner, s.subId, 5000)
    const res = await place(
      customer,
      { addressId: nearAddress, cart: [{ productId: p, quantity: 4 }] },
      randomUUID(),
    )
    expect(res.status).toBe(201)
    expect(res.body.data.order.deliveryFeePaise).toBe(0)
    expect(res.body.data.order.totalPaise).toBe(20000)
  })
})

describe("POST /v1/orders — coupon", () => {
  it("applies a coupon: redemption row + usageCount++ + discounted total", async () => {
    const admin = await loginSeededAdmin(app)
    const created = await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: COUPON_PCT, type: "PERCENT", value: 10, minOrderPaise: 1000 })
    expect(created.status).toBe(201)

    const res = await place(
      customer,
      { addressId: nearAddress, cart: [{ productId: productA, quantity: 1 }], couponCode: COUPON_PCT },
      randomUUID(),
    )
    expect(res.status).toBe(201)
    const o = res.body.data.order
    expect(o.itemsSubtotalPaise).toBe(10000)
    expect(o.discountPaise).toBe(1000) // 10% of 10000
    expect(o.totalPaise).toBe(9000)
    expect(o.couponCode).toBe(COUPON_PCT)

    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code: COUPON_PCT } })
    expect(coupon.usageCount).toBe(1)
    const redemption = await prisma.couponRedemption.findUnique({ where: { orderId: o.id } })
    expect(redemption?.discountAppliedPaise).toBe(1000)
  })

  it("rejects a coupon that hit its total usage limit (409)", async () => {
    const admin = await loginSeededAdmin(app)
    // Limit 1; consume it once, then a second placement must fail.
    const made = await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: COUPON_ONCE, type: "PERCENT", value: 10, minOrderPaise: 1000, totalUsageLimit: 1 })
    expect(made.status).toBe(201)
    const c2 = await signupCustomer(app, "Coupon Customer 2")
    const a2 = await addAddress(c2, STORE_LAT, STORE_LNG)
    const ok = await place(c2, { addressId: a2, cart: [{ productId: productA, quantity: 1 }], couponCode: COUPON_ONCE }, randomUUID())
    expect(ok.status).toBe(201)
    const c3 = await signupCustomer(app, "Coupon Customer 3")
    const a3 = await addAddress(c3, STORE_LAT, STORE_LNG)
    const blocked = await place(c3, { addressId: a3, cart: [{ productId: productA, quantity: 1 }], couponCode: COUPON_ONCE }, randomUUID())
    expect(blocked.status).toBe(409)
  })
})

describe("order reads + scoping", () => {
  it("customer reads own orders but not another customer's (404)", async () => {
    const place1 = await place(customer, { addressId: nearAddress, cart: [{ productId: productA, quantity: 1 }] }, randomUUID())
    const orderId = place1.body.data.order.id

    const mine = await api().get(`/v1/orders/${orderId}`).set("Cookie", customer.cookieHeader)
    expect(mine.status).toBe(200)

    const other = await signupCustomer(app, "Nosy Customer")
    const denied = await api().get(`/v1/orders/${orderId}`).set("Cookie", other.cookieHeader)
    expect(denied.status).toBe(404)

    const list = await api().get("/v1/orders").set("Cookie", customer.cookieHeader)
    expect(list.status).toBe(200)
    expect(list.body.data.items.length).toBeGreaterThan(0)
  })

  it("owner reads own-store orders but not another store's (404)", async () => {
    const placed = await place(customer, { addressId: nearAddress, cart: [{ productId: productA, quantity: 1 }] }, randomUUID())
    const orderId = placed.body.data.order.id

    const ownerView = await api().get(`/v1/stores/me/orders/${orderId}`).set("Cookie", store.owner.cookieHeader)
    expect(ownerView.status).toBe(200)
    expect(ownerView.body.data.order.customer.nameSnapshot).toBe("Order Customer")

    const otherOwner = await newStore({ phone: "+919990000009", open: true })
    const denied = await api().get(`/v1/stores/me/orders/${orderId}`).set("Cookie", otherOwner.owner.cookieHeader)
    expect(denied.status).toBe(404)
  })

  it("snapshots survive a later product price change", async () => {
    const placed = await place(customer, { addressId: nearAddress, cart: [{ productId: productA, quantity: 1 }] }, randomUUID())
    const orderId = placed.body.data.order.id
    const before = placed.body.data.order.items[0].unitPricePaiseSnapshot
    // Owner changes the live price afterwards.
    await api()
      .patch(`/v1/stores/me/products/${productA}`)
      .set("Cookie", store.owner.cookieHeader)
      .send({ pricePaise: 99999 })
    const after = await api().get(`/v1/orders/${orderId}`).set("Cookie", customer.cookieHeader)
    expect(after.body.data.order.items[0].unitPricePaiseSnapshot).toBe(before)
  })
})

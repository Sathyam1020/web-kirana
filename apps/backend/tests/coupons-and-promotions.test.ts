/**
 * Phase 4.3 integration tests — featured + promoted + coupons.
 *
 * The actual "apply at order" path for coupons lands in Phase 7 (order
 * placement); this file tests up to (and including) the preview endpoint.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
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

const baseStoreBody = {
  name: "Phase 4.3 Test Store",
  phone: "+919998000001",
  latitude: 12.9116,
  longitude: 77.6473,
  addressLine: "addr",
  city: "Bengaluru",
  pincode: "560102",
}

let categoryId: string

/** Convenience: resolve the owner's subcategory under the shared seed cat. */
async function sub(owner: AuthedCaller): Promise<string> {
  return ensureSubcategoryForOwner(owner, categoryId)
}

beforeAll(async () => {
  const cats = await prisma.category.findMany({ take: 1, orderBy: { displayOrder: "asc" } })
  if (cats[0] === undefined) throw new Error("Seed missing categories")
  categoryId = cats[0].id
})

afterAll(async () => {
  // Drop test coupons by code prefix so re-runs are clean.
  await prisma.coupon.deleteMany({ where: { code: { startsWith: "T43-" } } })
  await cleanupRun()
  await prisma.$disconnect()
})

// --- Featured ----------------------------------------------------------

describe("Featured products (owner)", () => {
  it("owner can feature + unfeature a product in their own store", async () => {
    const owner = await signupApprovedOwner(app, "Feature Owner")
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send(baseStoreBody)
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ subcategoryId: await sub(owner), name: "Featurable Product", pricePaise: 1000, unit: "PIECE" })
    const id = created.body.data.product.id

    const feat = await api()
      .post(`/v1/stores/me/products/${id}/feature`)
      .set("Cookie", owner.cookieHeader)
      .send({ featuredOrder: 5 })
    expect(feat.status).toBe(200)
    expect(feat.body.data.product.isFeatured).toBe(true)
    expect(feat.body.data.product.featuredOrder).toBe(5)

    const unfeat = await api()
      .delete(`/v1/stores/me/products/${id}/feature`)
      .set("Cookie", owner.cookieHeader)
    expect(unfeat.status).toBe(200)
    expect(unfeat.body.data.product.isFeatured).toBe(false)
    expect(unfeat.body.data.product.featuredOrder).toBeNull()
  })

  it("feature with default featuredOrder=0 when omitted", async () => {
    const owner = await signupApprovedOwner(app)
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send({ ...baseStoreBody, phone: "+919998000002" })
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ subcategoryId: await sub(owner), name: "Default Order", pricePaise: 1000, unit: "PIECE" })

    const feat = await api()
      .post(`/v1/stores/me/products/${created.body.data.product.id}/feature`)
      .set("Cookie", owner.cookieHeader)
      .send({})
    expect(feat.body.data.product.featuredOrder).toBe(0)
  })

  it("404 when feature-ing another owner's product (IDOR check)", async () => {
    const ownerA = await signupApprovedOwner(app, "Feat A")
    await api().post("/v1/stores/me").set("Cookie", ownerA.cookieHeader).send({ ...baseStoreBody, phone: "+919998000003" })
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", ownerA.cookieHeader)
      .send({ subcategoryId: await sub(ownerA), name: "A's product", pricePaise: 1000, unit: "PIECE" })
    const idOfA = created.body.data.product.id

    const ownerB = await signupApprovedOwner(app, "Feat B")
    await api().post("/v1/stores/me").set("Cookie", ownerB.cookieHeader).send({ ...baseStoreBody, phone: "+919998000004" })

    const res = await api()
      .post(`/v1/stores/me/products/${idOfA}/feature`)
      .set("Cookie", ownerB.cookieHeader)
      .send({ featuredOrder: 1 })
    expect(res.status).toBe(404)
  })

  it("customer cannot feature a product", async () => {
    const customer = await signupCustomer(app)
    const res = await api()
      .post(`/v1/stores/me/products/anything/feature`)
      .set("Cookie", customer.cookieHeader)
      .send({})
    expect(res.status).toBe(403)
  })
})

// --- Promoted ----------------------------------------------------------

describe("Promoted products (admin)", () => {
  it("admin promotes + unpromotes any product", async () => {
    const owner = await signupApprovedOwner(app)
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send({ ...baseStoreBody, phone: "+919998000005" })
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ subcategoryId: await sub(owner), name: "Promo Candidate", pricePaise: 1000, unit: "PIECE" })
    const productId = created.body.data.product.id

    const admin = await loginSeededAdmin(app)
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const promote = await api()
      .post(`/v1/admin/products/${productId}/promote`)
      .set("Cookie", admin.cookieHeader)
      .send({ promotedUntil: until })
    expect(promote.status).toBe(200)
    expect(promote.body.data.product.isPromoted).toBe(true)
    expect(new Date(promote.body.data.product.promotedUntil).getTime()).toBeGreaterThan(Date.now())

    const unpromote = await api()
      .delete(`/v1/admin/products/${productId}/promote`)
      .set("Cookie", admin.cookieHeader)
    expect(unpromote.status).toBe(200)
    expect(unpromote.body.data.product.isPromoted).toBe(false)
    expect(unpromote.body.data.product.promotedUntil).toBeNull()
  })

  it("rejects promotedUntil in the past", async () => {
    const owner = await signupApprovedOwner(app)
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send({ ...baseStoreBody, phone: "+919998000006" })
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ subcategoryId: await sub(owner), name: "Bad Promo", pricePaise: 1000, unit: "PIECE" })

    const admin = await loginSeededAdmin(app)
    const past = new Date(Date.now() - 1000).toISOString()
    const res = await api()
      .post(`/v1/admin/products/${created.body.data.product.id}/promote`)
      .set("Cookie", admin.cookieHeader)
      .send({ promotedUntil: past })
    expect(res.status).toBe(400)
  })

  it("owner cannot promote (admin-only)", async () => {
    const owner = await signupApprovedOwner(app)
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send({ ...baseStoreBody, phone: "+919998000007" })
    const res = await api()
      .post("/v1/admin/products/anything/promote")
      .set("Cookie", owner.cookieHeader)
      .send({ promotedUntil: new Date(Date.now() + 100000).toISOString() })
    expect(res.status).toBe(403)
  })

  it("404 on promoting a non-existent product", async () => {
    const admin = await loginSeededAdmin(app)
    const res = await api()
      .post("/v1/admin/products/does-not-exist-zzz/promote")
      .set("Cookie", admin.cookieHeader)
      .send({ promotedUntil: new Date(Date.now() + 100000).toISOString() })
    expect(res.status).toBe(404)
  })
})

// --- Admin coupons (GLOBAL) --------------------------------------------

describe("Admin GLOBAL coupons", () => {
  it("admin creates, lists, gets, updates, soft-deletes a global coupon", async () => {
    const admin = await loginSeededAdmin(app)

    const create = await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({
        code: "T43-WELCOME50",
        type: "PERCENT",
        value: 50,
        maxDiscountPaise: 10000,
        minOrderPaise: 19900,
        perUserLimit: 1,
        totalUsageLimit: 1000,
      })
    expect(create.status).toBe(201)
    expect(create.body.data.coupon).toMatchObject({
      code: "T43-WELCOME50",
      type: "PERCENT",
      value: 50,
      scope: "GLOBAL",
      storeId: null,
      maxDiscountPaise: 10000,
      minOrderPaise: 19900,
      usageCount: 0,
    })
    const id = create.body.data.coupon.id

    const get = await api().get(`/v1/admin/coupons/${id}`).set("Cookie", admin.cookieHeader)
    expect(get.status).toBe(200)
    expect(get.body.data.coupon.code).toBe("T43-WELCOME50")

    const list = await api().get("/v1/admin/coupons").set("Cookie", admin.cookieHeader)
    expect(list.status).toBe(200)
    expect(list.body.data.items.find((c: { code: string }) => c.code === "T43-WELCOME50")).toBeDefined()

    const patch = await api()
      .patch(`/v1/admin/coupons/${id}`)
      .set("Cookie", admin.cookieHeader)
      .send({ value: 25 })
    expect(patch.body.data.coupon.value).toBe(25)

    const del = await api().delete(`/v1/admin/coupons/${id}`).set("Cookie", admin.cookieHeader)
    expect(del.status).toBe(204)

    // Soft-deleted: still gettable, but isActive=false
    const after = await api().get(`/v1/admin/coupons/${id}`).set("Cookie", admin.cookieHeader)
    expect(after.body.data.coupon.isActive).toBe(false)
  })

  it("normalizes code to uppercase", async () => {
    const admin = await loginSeededAdmin(app)
    const create = await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: "t43-lowered", type: "FLAT_PAISE", value: 5000 })
    expect(create.status).toBe(201)
    expect(create.body.data.coupon.code).toBe("T43-LOWERED")
  })

  it("rejects duplicate code (409)", async () => {
    const admin = await loginSeededAdmin(app)
    const code = "T43-DUP"
    const first = await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code, type: "FLAT_PAISE", value: 5000 })
    expect(first.status).toBe(201)
    const dupe = await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code, type: "FLAT_PAISE", value: 5000 })
    expect(dupe.status).toBe(409)
  })

  it("rejects PERCENT value > 100", async () => {
    const admin = await loginSeededAdmin(app)
    const res = await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: "T43-BAD-PCT", type: "PERCENT", value: 200 })
    expect(res.status).toBe(400)
  })

  it("rejects maxDiscountPaise on FLAT_PAISE coupons", async () => {
    const admin = await loginSeededAdmin(app)
    const res = await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: "T43-BAD-FLAT", type: "FLAT_PAISE", value: 5000, maxDiscountPaise: 100 })
    expect(res.status).toBe(400)
  })

  it("rejects validUntil <= validFrom", async () => {
    const admin = await loginSeededAdmin(app)
    const from = new Date(Date.now() + 100000).toISOString()
    const until = new Date(Date.now() + 50000).toISOString()
    const res = await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: "T43-WINDOW-BAD", type: "FLAT_PAISE", value: 5000, validFrom: from, validUntil: until })
    expect(res.status).toBe(400)
  })

  it("customer + owner cannot reach admin coupons", async () => {
    const customer = await signupCustomer(app)
    const cRes = await api().get("/v1/admin/coupons").set("Cookie", customer.cookieHeader)
    expect(cRes.status).toBe(403)

    const owner = await signupApprovedOwner(app)
    const oRes = await api().get("/v1/admin/coupons").set("Cookie", owner.cookieHeader)
    expect(oRes.status).toBe(403)
  })
})

// --- Owner store coupons (STORE) ---------------------------------------

describe("Owner STORE coupons", () => {
  it("owner creates a store-scoped coupon; storeId derived server-side", async () => {
    const owner = await signupApprovedOwner(app)
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send({ ...baseStoreBody, phone: "+919998000010" })
    const me = await api().get("/v1/stores/me").set("Cookie", owner.cookieHeader)
    const myStoreId = me.body.data.store.id

    const create = await api()
      .post("/v1/stores/me/coupons")
      .set("Cookie", owner.cookieHeader)
      .send({
        code: "T43-STORE10",
        type: "PERCENT",
        value: 10,
        maxDiscountPaise: 5000,
        minOrderPaise: 9900,
      })
    expect(create.status).toBe(201)
    expect(create.body.data.coupon).toMatchObject({
      code: "T43-STORE10",
      scope: "STORE",
      storeId: myStoreId,
    })
  })

  it("owner cannot list a different store's coupons", async () => {
    // Owner A creates a coupon at their store
    const ownerA = await signupApprovedOwner(app, "Coupon Owner A")
    await api().post("/v1/stores/me").set("Cookie", ownerA.cookieHeader).send({ ...baseStoreBody, phone: "+919998000011" })
    await api()
      .post("/v1/stores/me/coupons")
      .set("Cookie", ownerA.cookieHeader)
      .send({ code: "T43-A-ONLY", type: "FLAT_PAISE", value: 1000 })

    // Owner B's list should NOT include T43-A-ONLY
    const ownerB = await signupApprovedOwner(app, "Coupon Owner B")
    await api().post("/v1/stores/me").set("Cookie", ownerB.cookieHeader).send({ ...baseStoreBody, phone: "+919998000012" })
    const listB = await api().get("/v1/stores/me/coupons").set("Cookie", ownerB.cookieHeader)
    expect(listB.status).toBe(200)
    expect(listB.body.data.items.find((c: { code: string }) => c.code === "T43-A-ONLY")).toBeUndefined()
  })

  it("404 STORE_NOT_CREATED before owner has a store", async () => {
    const owner = await signupApprovedOwner(app)
    const res = await api()
      .post("/v1/stores/me/coupons")
      .set("Cookie", owner.cookieHeader)
      .send({ code: "T43-NOSTORE", type: "FLAT_PAISE", value: 1000 })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("STORE_NOT_CREATED")
  })
})

// --- Customer preview --------------------------------------------------

describe("POST /v1/coupons/preview", () => {
  async function setupCustomerWithProducts(): Promise<{
    customer: Awaited<ReturnType<typeof signupCustomer>>
    storeId: string
    productId: string
    pricePaise: number
  }> {
    const owner = await signupApprovedOwner(app, "Preview Setup Owner")
    const phone = `+9197${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`
    await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send({ ...baseStoreBody, phone })
    const me = await api().get("/v1/stores/me").set("Cookie", owner.cookieHeader)
    const storeId = me.body.data.store.id

    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ subcategoryId: await sub(owner), name: "Preview Item", pricePaise: 5000, unit: "PIECE" })
    const productId = created.body.data.product.id

    const customer = await signupCustomer(app)
    return { customer, storeId, productId, pricePaise: 5000 }
  }

  it("valid GLOBAL PERCENT coupon returns correct discount", async () => {
    const admin = await loginSeededAdmin(app)
    await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: "T43-PCT20", type: "PERCENT", value: 20, minOrderPaise: 1000 })

    const { customer, productId } = await setupCustomerWithProducts()
    const res = await api()
      .post("/v1/coupons/preview")
      .set("Cookie", customer.cookieHeader)
      .send({ code: "T43-PCT20", cart: [{ productId, quantity: 2 }] })

    expect(res.status).toBe(200)
    expect(res.body.data.isValid).toBe(true)
    // Subtotal = 5000 * 2 = 10000. 20% = 2000.
    expect(res.body.data.discountPaise).toBe(2000)
    expect(res.body.data.breakdown.subtotalPaise).toBe(10000)
    expect(res.body.data.breakdown.finalPaise).toBe(8000)
  })

  it("PERCENT with maxDiscountPaise caps the discount", async () => {
    const admin = await loginSeededAdmin(app)
    await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: "T43-PCT50CAP", type: "PERCENT", value: 50, maxDiscountPaise: 3000 })

    const { customer, productId } = await setupCustomerWithProducts()
    const res = await api()
      .post("/v1/coupons/preview")
      .set("Cookie", customer.cookieHeader)
      .send({ code: "T43-PCT50CAP", cart: [{ productId, quantity: 2 }] })

    // 50% of 10000 = 5000, capped at 3000.
    expect(res.body.data.discountPaise).toBe(3000)
  })

  it("FLAT_PAISE never discounts more than the subtotal", async () => {
    const admin = await loginSeededAdmin(app)
    await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: "T43-FLAT99K", type: "FLAT_PAISE", value: 99000 })

    const { customer, productId } = await setupCustomerWithProducts()
    const res = await api()
      .post("/v1/coupons/preview")
      .set("Cookie", customer.cookieHeader)
      .send({ code: "T43-FLAT99K", cart: [{ productId, quantity: 1 }] })

    // Subtotal 5000 < coupon 99000 → discount = subtotal
    expect(res.body.data.discountPaise).toBe(5000)
    expect(res.body.data.breakdown.finalPaise).toBe(0)
  })

  it("returns isValid=false INVALID_CODE for unknown code", async () => {
    const { customer, productId } = await setupCustomerWithProducts()
    const res = await api()
      .post("/v1/coupons/preview")
      .set("Cookie", customer.cookieHeader)
      .send({ code: "T43-DOESNOTEXIST", cart: [{ productId, quantity: 1 }] })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ isValid: false, reason: "INVALID_CODE" })
  })

  it("MIN_ORDER_NOT_MET when subtotal under threshold", async () => {
    const admin = await loginSeededAdmin(app)
    await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: "T43-MIN200", type: "FLAT_PAISE", value: 5000, minOrderPaise: 20_000 })

    const { customer, productId } = await setupCustomerWithProducts()
    const res = await api()
      .post("/v1/coupons/preview")
      .set("Cookie", customer.cookieHeader)
      .send({ code: "T43-MIN200", cart: [{ productId, quantity: 1 }] })
    expect(res.body.data).toMatchObject({ isValid: false, reason: "MIN_ORDER_NOT_MET" })
    expect(res.body.data.minOrderPaise).toBe(20_000)
  })

  it("expired coupon returns INVALID_CODE (lifecycle states collapsed)", async () => {
    const admin = await loginSeededAdmin(app)
    // Create then immediately expire it via direct DB update
    const create = await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: "T43-PASTUNTIL", type: "FLAT_PAISE", value: 1000 })
    await prisma.coupon.update({
      where: { id: create.body.data.coupon.id },
      data: { validUntil: new Date(Date.now() - 1000) },
    })

    const { customer, productId } = await setupCustomerWithProducts()
    const res = await api()
      .post("/v1/coupons/preview")
      .set("Cookie", customer.cookieHeader)
      .send({ code: "T43-PASTUNTIL", cart: [{ productId, quantity: 1 }] })
    // Distinguishable reasons here would leak coupon existence to a code-
    // space scanner — the service collapses lifecycle failures to INVALID_CODE.
    expect(res.body.data).toMatchObject({ isValid: false, reason: "INVALID_CODE" })
  })

  it("inactive coupon returns INVALID_CODE (no information leak)", async () => {
    const admin = await loginSeededAdmin(app)
    const create = await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: "T43-INACTIVE", type: "FLAT_PAISE", value: 1000 })
    await api()
      .delete(`/v1/admin/coupons/${create.body.data.coupon.id}`)
      .set("Cookie", admin.cookieHeader)

    const { customer, productId } = await setupCustomerWithProducts()
    const res = await api()
      .post("/v1/coupons/preview")
      .set("Cookie", customer.cookieHeader)
      .send({ code: "T43-INACTIVE", cart: [{ productId, quantity: 1 }] })
    expect(res.body.data).toMatchObject({ isValid: false, reason: "INVALID_CODE" })
  })

  it("store-scoped coupon used at the wrong store returns INVALID_CODE", async () => {
    // Owner A creates STORE coupon
    const ownerA = await signupApprovedOwner(app, "Wrong Store A")
    await api().post("/v1/stores/me").set("Cookie", ownerA.cookieHeader).send({ ...baseStoreBody, phone: `+9197${Math.floor(Math.random() * 9_000_000 + 1_000_000)}` })
    await api()
      .post("/v1/stores/me/coupons")
      .set("Cookie", ownerA.cookieHeader)
      .send({ code: "T43-A-STORE", type: "FLAT_PAISE", value: 500 })

    // Customer's cart is from a different store
    const { customer, productId } = await setupCustomerWithProducts()
    const res = await api()
      .post("/v1/coupons/preview")
      .set("Cookie", customer.cookieHeader)
      .send({ code: "T43-A-STORE", cart: [{ productId, quantity: 1 }] })
    // Same opacity rule — store-scope mismatch is treated like an unknown
    // code so attackers can't enumerate private store codes.
    expect(res.body.data).toMatchObject({ isValid: false, reason: "INVALID_CODE" })
  })

  it("PRODUCT_UNAVAILABLE when a cart item has isAvailable=false", async () => {
    const admin = await loginSeededAdmin(app)
    await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: "T43-AVAIL-TEST", type: "FLAT_PAISE", value: 500 })

    const { customer, productId } = await setupCustomerWithProducts()
    await prisma.product.update({ where: { id: productId }, data: { isAvailable: false } })
    try {
      const res = await api()
        .post("/v1/coupons/preview")
        .set("Cookie", customer.cookieHeader)
        .send({ code: "T43-AVAIL-TEST", cart: [{ productId, quantity: 1 }] })
      expect(res.body.data).toMatchObject({ isValid: false, reason: "PRODUCT_UNAVAILABLE" })
    } finally {
      await prisma.product.update({ where: { id: productId }, data: { isAvailable: true } })
    }
  })

  it("MULTI_STORE_CART when items span two stores", async () => {
    const admin = await loginSeededAdmin(app)
    await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: "T43-MULTI", type: "FLAT_PAISE", value: 500 })

    // Two seed products from different stores
    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, storeId: true },
      take: 50,
    })
    const byStore = new Map<string, string>()
    for (const p of products) {
      if (!byStore.has(p.storeId)) byStore.set(p.storeId, p.id)
      if (byStore.size >= 2) break
    }
    if (byStore.size < 2) throw new Error("Seed needs ≥2 stores")
    const [idA, idB] = Array.from(byStore.values())

    const customer = await signupCustomer(app)
    const res = await api()
      .post("/v1/coupons/preview")
      .set("Cookie", customer.cookieHeader)
      .send({ code: "T43-MULTI", cart: [{ productId: idA!, quantity: 1 }, { productId: idB!, quantity: 1 }] })
    expect(res.body.data).toMatchObject({ isValid: false, reason: "MULTI_STORE_CART" })
  })

  it("rejects anonymous preview (401)", async () => {
    const res = await api()
      .post("/v1/coupons/preview")
      .send({ code: "T43-ANY", cart: [{ productId: "p", quantity: 1 }] })
    expect(res.status).toBe(401)
  })

  it("rejects owner role on preview (CUSTOMER-only)", async () => {
    const owner = await signupApprovedOwner(app)
    const res = await api()
      .post("/v1/coupons/preview")
      .set("Cookie", owner.cookieHeader)
      .send({ code: "T43-ANY", cart: [{ productId: "p", quantity: 1 }] })
    expect(res.status).toBe(403)
  })

  it("404 on the public router catch-all (GET not allowed)", async () => {
    const customer = await signupCustomer(app)
    const res = await api()
      .get("/v1/coupons/whatever")
      .set("Cookie", customer.cookieHeader)
    expect(res.status).toBe(404)
  })
})

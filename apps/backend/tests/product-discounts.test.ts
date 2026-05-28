/**
 * Phase 6.8 — per-product discounts: view exposes discount fields +
 * effectivePricePaise, FLAT must be < price, expired discount is inactive,
 * and coupons stack on the discounted subtotal.
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
  name: "Discount Test Store",
  phone: "+919999555555",
  latitude: 12.9116,
  longitude: 77.6473,
  addressLine: "addr",
  city: "Bengaluru",
  pincode: "560102",
}

let owner: AuthedCaller
let subcategoryId: string

beforeAll(async () => {
  owner = await signupApprovedOwner(app, "Discount Owner")
  await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send(baseStoreBody)
  const cat = await prisma.category.findFirstOrThrow({ orderBy: { displayOrder: "asc" } })
  subcategoryId = await ensureSubcategoryForOwner(owner, cat.id)
})

afterAll(async () => {
  await prisma.coupon.deleteMany({ where: { code: { startsWith: "T68-" } } })
  await cleanupRun()
})

function createProduct(body: Record<string, unknown>) {
  return api()
    .post("/v1/stores/me/products")
    .set("Cookie", owner.cookieHeader)
    .send({ subcategoryId, name: "Discounted Item", unit: "PIECE", ...body })
}

describe("product discounts", () => {
  it("PERCENT discount: view returns fields + effectivePricePaise", async () => {
    const res = await createProduct({
      pricePaise: 10000,
      discountType: "PERCENT",
      discountValue: 20,
    })
    expect(res.status).toBe(201)
    const p = res.body.data.product
    expect(p.discountType).toBe("PERCENT")
    expect(p.discountValue).toBe(20)
    expect(p.effectivePricePaise).toBe(8000) // 10000 - 20%
  })

  it("FLAT_PAISE >= price is rejected (400)", async () => {
    const equal = await createProduct({
      pricePaise: 5000,
      discountType: "FLAT_PAISE",
      discountValue: 5000,
    })
    expect(equal.status).toBe(400)
    const over = await createProduct({
      pricePaise: 5000,
      discountType: "FLAT_PAISE",
      discountValue: 6000,
    })
    expect(over.status).toBe(400)
  })

  it("FLAT_PAISE under price discounts correctly", async () => {
    const res = await createProduct({
      pricePaise: 5000,
      discountType: "FLAT_PAISE",
      discountValue: 1500,
    })
    expect(res.status).toBe(201)
    expect(res.body.data.product.effectivePricePaise).toBe(3500)
  })

  it("expired discount is inactive (effectivePricePaise == pricePaise)", async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const res = await createProduct({
      pricePaise: 10000,
      discountType: "PERCENT",
      discountValue: 50,
      discountValidUntil: past,
    })
    expect(res.status).toBe(201)
    const p = res.body.data.product
    expect(p.discountType).toBe("PERCENT") // stored…
    expect(p.effectivePricePaise).toBe(10000) // …but not applied (expired)
  })

  it("coupon stacks on the discounted subtotal", async () => {
    // Product ₹100, 50% product discount → effective ₹50.
    const created = await createProduct({
      pricePaise: 10000,
      discountType: "PERCENT",
      discountValue: 50,
    })
    const productId = created.body.data.product.id

    // A 20% GLOBAL coupon.
    const admin = await loginSeededAdmin(app)
    await api()
      .post("/v1/admin/coupons")
      .set("Cookie", admin.cookieHeader)
      .send({ code: "T68-PCT20", type: "PERCENT", value: 20, minOrderPaise: 1000 })

    const customer = await signupCustomer(app, "Discount Customer")
    const res = await api()
      .post("/v1/coupons/preview")
      .set("Cookie", customer.cookieHeader)
      .send({ code: "T68-PCT20", cart: [{ productId, quantity: 2 }] })

    expect(res.status).toBe(200)
    expect(res.body.data.isValid).toBe(true)
    // Subtotal uses the discounted price: 5000 * 2 = 10000 (NOT 20000).
    expect(res.body.data.breakdown.subtotalPaise).toBe(10000)
    // Coupon 20% of the discounted subtotal = 2000, final 8000.
    expect(res.body.data.discountPaise).toBe(2000)
    expect(res.body.data.breakdown.finalPaise).toBe(8000)
  })
})

/**
 * IP-2 — Product variants CRUD + invariants.
 *
 * Smoke + edge-case coverage for the variants array on create/update,
 * the one-default invariant, per-store SKU uniqueness, the diff-upsert
 * (id-matched updates, missing-id deletes, new-entry inserts), per-
 * variant image fallback at placement, and the legacy synthesis path
 * (callers that don't pass `variants` get a Default variant auto-built
 * from pricePaise + unit).
 *
 * See apps/backend/IP2.md.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import { randomUUID } from "node:crypto"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/db/prisma.js"
import {
  type AuthedCaller,
  cleanupRun,
  ensureSubcategoryForOwner,
  signupApprovedOwner,
  signupCustomer,
} from "./helpers/factories.js"

const app = buildApp()
const api = () => request(app)

// Bengaluru — every test fixture sits here so the customer address falls
// inside the store's default 3km radius.
const STORE_LAT = 12.9116
const STORE_LNG = 77.6473

let categoryId: string
let owner: AuthedCaller
let storeId: string
let subId: string
let customer: AuthedCaller
let nearAddress: string

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow({ orderBy: { displayOrder: "asc" } })).id
  owner = await signupApprovedOwner(app, "Variant Owner")
  await api()
    .post("/v1/stores/me")
    .set("Cookie", owner.cookieHeader)
    .send({
      name: "Variant Store",
      phone: "+919992000001",
      latitude: STORE_LAT,
      longitude: STORE_LNG,
      addressLine: "addr",
      city: "Bengaluru",
      pincode: "560102",
    })
  await api().patch("/v1/stores/me/open").set("Cookie", owner.cookieHeader).send({ isOpen: true })
  const store = await prisma.store.findUniqueOrThrow({
    where: { ownerId: owner.user.id },
    select: { id: true },
  })
  storeId = store.id
  subId = await ensureSubcategoryForOwner(owner, categoryId)

  customer = await signupCustomer(app, "Variant Customer")
  const a = await api()
    .post("/v1/addresses")
    .set("Cookie", customer.cookieHeader)
    .send({
      label: "Home",
      line1: "1 Main St",
      city: "Bengaluru",
      pincode: "560102",
      latitude: STORE_LAT,
      longitude: STORE_LNG,
    })
  nearAddress = a.body.data.address.id
})

afterAll(async () => {
  await cleanupRun()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createWithVariants(
  variants: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await api()
    .post("/v1/stores/me/products")
    .set("Cookie", owner.cookieHeader)
    .send({
      subcategoryId: subId,
      name: `IP-2 Product ${randomUUID().slice(0, 8)}`,
      pricePaise: 10000,
      unit: "PIECE",
      variants,
      ...overrides,
    })
  expect(res.status).toBe(201)
  return res.body.data.product.id as string
}

async function createLegacy(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await api()
    .post("/v1/stores/me/products")
    .set("Cookie", owner.cookieHeader)
    .send({
      subcategoryId: subId,
      name: `Legacy ${randomUUID().slice(0, 8)}`,
      pricePaise: 5000,
      unit: "PIECE",
      ...overrides,
    })
  expect(res.status).toBe(201)
  return res.body.data.product.id as string
}

// ---------------------------------------------------------------------------

describe("CreateProduct — variants array", () => {
  it("creates a product with multiple variants and exactly one default", async () => {
    const pid = await createWithVariants([
      { name: "500 g", unitValue: 500, unit: "G", pricePaise: 6000 },
      { name: "1 kg", unitValue: 1, unit: "KG", pricePaise: 11000, isDefault: true },
      { name: "5 kg", unitValue: 5, unit: "KG", pricePaise: 50000 },
    ])
    const fetched = await api()
      .get(`/v1/stores/me/products/${pid}`)
      .set("Cookie", owner.cookieHeader)
    expect(fetched.status).toBe(200)
    const product = fetched.body.data.product
    expect(product.variants).toHaveLength(3)
    const defaults = product.variants.filter((v: { isDefault: boolean }) => v.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].name).toBe("1 kg")
  })

  it("auto-marks first variant default when zero defaults are sent", async () => {
    const pid = await createWithVariants([
      { name: "Pack of 6", unitValue: 6, unit: "PIECE", pricePaise: 3000 },
      { name: "Pack of 12", unitValue: 12, unit: "PIECE", pricePaise: 5500 },
    ])
    const fetched = await api()
      .get(`/v1/stores/me/products/${pid}`)
      .set("Cookie", owner.cookieHeader)
    const product = fetched.body.data.product
    const defaults = product.variants.filter((v: { isDefault: boolean }) => v.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].name).toBe("Pack of 6")
  })

  it("rejects two variants with isDefault=true (400 VALIDATION_ERROR)", async () => {
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({
        subcategoryId: subId,
        name: "Bad defaults",
        pricePaise: 10000,
        unit: "PIECE",
        variants: [
          { name: "A", unitValue: 1, unit: "PIECE", pricePaise: 1000, isDefault: true },
          { name: "B", unitValue: 2, unit: "PIECE", pricePaise: 2000, isDefault: true },
        ],
      })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
  })

  it("rejects duplicate variant names within the array (400)", async () => {
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({
        subcategoryId: subId,
        name: "Dup names",
        pricePaise: 10000,
        unit: "PIECE",
        variants: [
          { name: "Same", unitValue: 1, unit: "PIECE", pricePaise: 1000 },
          { name: "Same", unitValue: 2, unit: "PIECE", pricePaise: 2000 },
        ],
      })
    expect(res.status).toBe(400)
  })
})

describe("CreateProduct — legacy path (no variants array)", () => {
  it("synthesizes one Default variant from pricePaise + unit", async () => {
    const pid = await createLegacy({ pricePaise: 7500, unit: "G" })
    const fetched = await api()
      .get(`/v1/stores/me/products/${pid}`)
      .set("Cookie", owner.cookieHeader)
    const product = fetched.body.data.product
    expect(product.variants).toHaveLength(1)
    expect(product.variants[0]).toMatchObject({
      name: "Default",
      pricePaise: 7500,
      unit: "G",
      isDefault: true,
    })
  })
})

describe("UpdateProduct — variants diff/upsert", () => {
  it("inserts new, updates existing-by-id, deletes missing", async () => {
    const pid = await createWithVariants([
      { name: "Small", unitValue: 250, unit: "ML", pricePaise: 5000 },
      { name: "Medium", unitValue: 500, unit: "ML", pricePaise: 9000, isDefault: true },
      { name: "Old SKU we'll drop", unitValue: 1000, unit: "ML", pricePaise: 15000 },
    ])
    const before = (
      await api().get(`/v1/stores/me/products/${pid}`).set("Cookie", owner.cookieHeader)
    ).body.data.product
    const medium = before.variants.find((v: { name: string }) => v.name === "Medium")

    // PATCH: keep Medium (with id) but bump price, add a new XL, drop Small + Old.
    const res = await api()
      .patch(`/v1/stores/me/products/${pid}`)
      .set("Cookie", owner.cookieHeader)
      .send({
        variants: [
          { id: medium.id, name: "Medium", unitValue: 500, unit: "ML", pricePaise: 10000, isDefault: true },
          { name: "XL", unitValue: 2000, unit: "ML", pricePaise: 25000 },
        ],
      })
    expect(res.status).toBe(200)

    const after = res.body.data.product
    expect(after.variants).toHaveLength(2)
    const names = after.variants.map((v: { name: string }) => v.name).sort()
    expect(names).toEqual(["Medium", "XL"])
    const updatedMedium = after.variants.find((v: { name: string }) => v.name === "Medium")
    expect(updatedMedium.pricePaise).toBe(10000)
    // Medium kept its original id; the upsert path did an UPDATE not an INSERT.
    expect(updatedMedium.id).toBe(medium.id)
  })

  it("mirrors the new default variant's price+unit onto deprecated Product.pricePaise/unit", async () => {
    const pid = await createWithVariants([
      { name: "S", unitValue: 1, unit: "PIECE", pricePaise: 4000, isDefault: true },
    ])
    await api()
      .patch(`/v1/stores/me/products/${pid}`)
      .set("Cookie", owner.cookieHeader)
      .send({
        variants: [
          { name: "S", unitValue: 1, unit: "PIECE", pricePaise: 4000 },
          { name: "L", unitValue: 3, unit: "PIECE", pricePaise: 9000, isDefault: true },
        ],
      })
    // Read raw row — the legacy Product.pricePaise should now equal L's price.
    const row = await prisma.product.findUniqueOrThrow({
      where: { id: pid },
      select: { pricePaise: true, unit: true },
    })
    expect(row.pricePaise).toBe(9000)
    expect(row.unit).toBe("PIECE")
  })
})

describe("SKU uniqueness within a store", () => {
  it("rejects a SKU duplicated across two variants of the same product (400)", async () => {
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({
        subcategoryId: subId,
        name: "SKU dup intra-product",
        pricePaise: 10000,
        unit: "PIECE",
        variants: [
          { name: "A", unitValue: 1, unit: "PIECE", pricePaise: 1000, sku: "DUP-1" },
          { name: "B", unitValue: 2, unit: "PIECE", pricePaise: 2000, sku: "DUP-1" },
        ],
      })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe("SKU_CONFLICT")
  })

  it("rejects a SKU already used by a variant of another product in the same store (409)", async () => {
    const sku = `SKU-${randomUUID().slice(0, 6)}`
    await createWithVariants([
      { name: "First", unitValue: 1, unit: "PIECE", pricePaise: 1000, sku },
    ])
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({
        subcategoryId: subId,
        name: "Second product",
        pricePaise: 10000,
        unit: "PIECE",
        variants: [{ name: "Reused", unitValue: 1, unit: "PIECE", pricePaise: 1000, sku }],
      })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe("SKU_CONFLICT")
  })

  it("lets a variant keep its OWN SKU on update", async () => {
    const sku = `SKU-OK-${randomUUID().slice(0, 6)}`
    const pid = await createWithVariants([
      { name: "Only", unitValue: 1, unit: "PIECE", pricePaise: 1000, sku },
    ])
    const before = (
      await api().get(`/v1/stores/me/products/${pid}`).set("Cookie", owner.cookieHeader)
    ).body.data.product
    const v = before.variants[0]
    const res = await api()
      .patch(`/v1/stores/me/products/${pid}`)
      .set("Cookie", owner.cookieHeader)
      .send({
        variants: [
          { id: v.id, name: "Only", unitValue: 1, unit: "PIECE", pricePaise: 1500, sku },
        ],
      })
    expect(res.status).toBe(200)
  })
})

describe("Order placement — variant-aware snapshots", () => {
  it("snapshots variantId + variantName + variantUnitValue at placement", async () => {
    const pid = await createWithVariants([
      { name: "500 g", unitValue: 500, unit: "G", pricePaise: 8000, isDefault: true },
      { name: "1 kg", unitValue: 1, unit: "KG", pricePaise: 15000 },
    ])
    const product = (
      await api().get(`/v1/stores/me/products/${pid}`).set("Cookie", owner.cookieHeader)
    ).body.data.product
    const oneKg = product.variants.find((v: { name: string }) => v.name === "1 kg")

    const res = await api()
      .post("/v1/orders")
      .set("Cookie", customer.cookieHeader)
      .set("Idempotency-Key", randomUUID())
      .send({
        addressId: nearAddress,
        cart: [{ variantId: oneKg.id, quantity: 2 }],
      })
    expect(res.status).toBe(201)
    const item = res.body.data.order.items[0]
    expect(item.variantId).toBe(oneKg.id)
    expect(item.variantName).toBe("1 kg")
    expect(item.variantUnitValue).toBe("1") // Decimal serialized as string
    expect(item.unitPricePaiseSnapshot).toBe(15000)
    expect(item.unitSnapshot).toBe("KG")
  })

  it("resolves a legacy {productId} cart item to the product's default variant", async () => {
    const pid = await createWithVariants([
      { name: "Default for legacy", unitValue: 1, unit: "PIECE", pricePaise: 4000, isDefault: true },
      { name: "Alt", unitValue: 2, unit: "PIECE", pricePaise: 7000 },
    ])
    const res = await api()
      .post("/v1/orders")
      .set("Cookie", customer.cookieHeader)
      .set("Idempotency-Key", randomUUID())
      .send({
        addressId: nearAddress,
        cart: [{ productId: pid, quantity: 1 }], // legacy shape
      })
    expect(res.status).toBe(201)
    const item = res.body.data.order.items[0]
    expect(item.variantName).toBe("Default for legacy")
    expect(item.unitPricePaiseSnapshot).toBe(4000)
  })

  it("rejects a cart item with both variantId and productId (400)", async () => {
    const pid = await createLegacy()
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { productId: pid },
      select: { id: true },
    })
    const res = await api()
      .post("/v1/orders")
      .set("Cookie", customer.cookieHeader)
      .set("Idempotency-Key", randomUUID())
      .send({
        addressId: nearAddress,
        cart: [{ variantId: variant.id, productId: pid, quantity: 1 }],
      })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
  })

  it("rejects when the targeted variant is isAvailable=false (409 CART_CHANGED)", async () => {
    const pid = await createWithVariants([
      { name: "OOS", unitValue: 1, unit: "PIECE", pricePaise: 4000, isAvailable: false, isDefault: true },
    ])
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { productId: pid },
      select: { id: true },
    })
    const res = await api()
      .post("/v1/orders")
      .set("Cookie", customer.cookieHeader)
      .set("Idempotency-Key", randomUUID())
      .send({
        addressId: nearAddress,
        cart: [{ variantId: variant.id, quantity: 1 }],
      })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe("CART_CHANGED")
  })

  it("snapshots the RESOLVED image (variant's if present, else product's)", async () => {
    const pid = await createWithVariants(
      [
        {
          name: "With own img",
          unitValue: 1,
          unit: "PIECE",
          pricePaise: 5000,
          isDefault: true,
          imageUrl: "https://example.com/variant.jpg",
        },
      ],
      { imageUrl: "https://example.com/product.jpg" },
    )
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { productId: pid },
      select: { id: true },
    })
    const res = await api()
      .post("/v1/orders")
      .set("Cookie", customer.cookieHeader)
      .set("Idempotency-Key", randomUUID())
      .send({
        addressId: nearAddress,
        cart: [{ variantId: variant.id, quantity: 1 }],
      })
    expect(res.status).toBe(201)
    expect(res.body.data.order.items[0].imageUrlSnapshot).toBe("https://example.com/variant.jpg")
  })

  it("falls back to product image when variant has none", async () => {
    const pid = await createWithVariants(
      [
        { name: "No own img", unitValue: 1, unit: "PIECE", pricePaise: 5000, isDefault: true },
      ],
      { imageUrl: "https://example.com/fallback.jpg" },
    )
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { productId: pid },
      select: { id: true },
    })
    const res = await api()
      .post("/v1/orders")
      .set("Cookie", customer.cookieHeader)
      .set("Idempotency-Key", randomUUID())
      .send({
        addressId: nearAddress,
        cart: [{ variantId: variant.id, quantity: 1 }],
      })
    expect(res.status).toBe(201)
    expect(res.body.data.order.items[0].imageUrlSnapshot).toBe("https://example.com/fallback.jpg")
  })
})

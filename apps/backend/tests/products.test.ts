/**
 * Phase 4.1 integration tests — owner-side product CRUD + cross-owner
 * isolation + role gating.
 *
 * Phase 6.6 update: products now FK to Subcategory (L3). Each test
 * resolves a subcategory under the shared seed-category via the
 * `ensureSubcategoryForOwner` helper. The previous `categoryId` body
 * field is gone; ProductView still exposes categoryId via JOIN so
 * downstream assertions about the returned shape remain valid.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
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

const baseStoreBody = {
  name: "Products Test Store",
  phone: "+919999111111",
  latitude: 12.9116,
  longitude: 77.6473,
  addressLine: "addr",
  city: "Bengaluru",
  pincode: "560102",
}

const baseProductBody = {
  name: "Aashirvaad Atta 5kg",
  description: "Whole-wheat flour",
  pricePaise: 32500,
  unit: "KG",
  isAvailable: true,
}

// Shared category id resolved at start. Seed includes 4+ categories.
let categoryId: string

async function setUpOwnerWithStore(name?: string): Promise<AuthedCaller> {
  const owner = await signupApprovedOwner(app, name)
  await api().post("/v1/stores/me").set("Cookie", owner.cookieHeader).send(baseStoreBody)
  return owner
}

/** Resolve a subcategory under the shared seed category for this owner. */
async function subForOwner(owner: AuthedCaller): Promise<string> {
  return ensureSubcategoryForOwner(owner, categoryId)
}

beforeAll(async () => {
  const cats = await prisma.category.findMany({ take: 1, orderBy: { displayOrder: "asc" } })
  if (cats[0] === undefined) {
    throw new Error("Seed missing categories — run `npm run db:seed --workspace=@workspace/backend`")
  }
  categoryId = cats[0].id
})

afterAll(async () => {
  await cleanupRun()
  await prisma.$disconnect()
})

describe("POST /v1/stores/me/products", () => {
  it("creates a product when store + subcategory exist", async () => {
    const owner = await setUpOwnerWithStore()
    const subcategoryId = await subForOwner(owner)
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, subcategoryId })
    expect(res.status).toBe(201)
    expect(res.body.data.product).toMatchObject({
      name: baseProductBody.name,
      pricePaise: baseProductBody.pricePaise,
      unit: "KG",
      isActive: true,
      isAvailable: true,
      subcategoryId,
      // Phase 6.6: categoryId still on the response (derived via JOIN).
      categoryId,
    })
    expect(typeof res.body.data.product.categoryName).toBe("string")
    expect(typeof res.body.data.product.subcategoryName).toBe("string")
    expect(typeof res.body.data.product.departmentName).toBe("string")
  })

  it("404 STORE_NOT_CREATED if owner has no store", async () => {
    const owner = await signupApprovedOwner(app)
    // Can't resolve a sub without a store; the route fails earlier on
    // requireOwnStore so any non-empty subcategoryId is fine.
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, subcategoryId: "does-not-matter" })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("STORE_NOT_CREATED")
  })

  it("400 on bogus subcategoryId (clean message, not P2003)", async () => {
    const owner = await setUpOwnerWithStore()
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, subcategoryId: "does-not-exist-zzz" })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
    expect(res.body.error.message).toMatch(/[Ss]ubcategory/)
  })

  it("400 on subcategoryId that belongs to ANOTHER store (no IDOR)", async () => {
    const ownerA = await setUpOwnerWithStore("AAA")
    const subA = await subForOwner(ownerA)
    const ownerB = await signupApprovedOwner(app, "BBB")
    await api()
      .post("/v1/stores/me")
      .set("Cookie", ownerB.cookieHeader)
      .send({ ...baseStoreBody, phone: "+919999222222" })

    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", ownerB.cookieHeader)
      .send({ ...baseProductBody, subcategoryId: subA })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/store/i)
  })

  it("400 on negative price", async () => {
    const owner = await setUpOwnerWithStore()
    const subcategoryId = await subForOwner(owner)
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, subcategoryId, pricePaise: -1 })
    expect(res.status).toBe(400)
  })

  it("400 on price below ₹1 floor", async () => {
    const owner = await setUpOwnerWithStore()
    const subcategoryId = await subForOwner(owner)
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, subcategoryId, pricePaise: 50 })
    expect(res.status).toBe(400)
  })

  it("400 on non-integer price", async () => {
    const owner = await setUpOwnerWithStore()
    const subcategoryId = await subForOwner(owner)
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, subcategoryId, pricePaise: 99.5 })
    expect(res.status).toBe(400)
  })

  it("400 on invalid Unit", async () => {
    const owner = await setUpOwnerWithStore()
    const subcategoryId = await subForOwner(owner)
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, subcategoryId, unit: "STONE" })
    expect(res.status).toBe(400)
  })

  it("customer is denied 403", async () => {
    const customer = await signupCustomer(app)
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", customer.cookieHeader)
      .send({ ...baseProductBody, subcategoryId: "anything" })
    expect(res.status).toBe(403)
  })
})

describe("GET /v1/stores/me/products", () => {
  it("lists products from this owner only, paginated", async () => {
    const owner = await setUpOwnerWithStore()
    const subcategoryId = await subForOwner(owner)
    for (let i = 0; i < 3; i++) {
      await api()
        .post("/v1/stores/me/products")
        .set("Cookie", owner.cookieHeader)
        .send({ ...baseProductBody, name: `P${i}`, subcategoryId })
    }
    const res = await api()
      .get("/v1/stores/me/products?limit=2")
      .set("Cookie", owner.cookieHeader)
    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBe(2)
    expect(res.body.data.hasMore).toBe(true)
    expect(typeof res.body.data.nextCursor).toBe("string")

    const page2 = await api()
      .get(`/v1/stores/me/products?limit=2&cursor=${res.body.data.nextCursor}`)
      .set("Cookie", owner.cookieHeader)
    expect(page2.status).toBe(200)
    expect(page2.body.data.items.length).toBe(1)
    expect(page2.body.data.hasMore).toBe(false)
  })

  it("filters by categoryId (L2 via JOIN) and availability", async () => {
    const owner = await setUpOwnerWithStore()
    const cats = await prisma.category.findMany({ take: 2, orderBy: { displayOrder: "asc" } })
    const catA = cats[0]!.id
    const catB = cats[1]!.id
    const subA = await ensureSubcategoryForOwner(owner, catA)
    const subB = await ensureSubcategoryForOwner(owner, catB)

    await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, name: "PA1", subcategoryId: subA })
    await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, name: "PB1", subcategoryId: subB, isAvailable: false })

    // ?categoryId= (L2) joins through subcategory.
    const byA = await api()
      .get(`/v1/stores/me/products?categoryId=${catA}`)
      .set("Cookie", owner.cookieHeader)
    expect(byA.body.data.items.length).toBe(1)
    expect(byA.body.data.items[0].name).toBe("PA1")

    // ?subcategoryId= (L3) — exact match.
    const bySubB = await api()
      .get(`/v1/stores/me/products?subcategoryId=${subB}`)
      .set("Cookie", owner.cookieHeader)
    expect(bySubB.body.data.items.length).toBe(1)
    expect(bySubB.body.data.items[0].name).toBe("PB1")

    const onlyAvail = await api()
      .get("/v1/stores/me/products?available=true")
      .set("Cookie", owner.cookieHeader)
    expect(onlyAvail.body.data.items.map((p: { name: string }) => p.name).sort()).toEqual(["PA1"])

    const onlyUnavail = await api()
      .get("/v1/stores/me/products?available=false")
      .set("Cookie", owner.cookieHeader)
    expect(onlyUnavail.body.data.items.map((p: { name: string }) => p.name)).toEqual(["PB1"])
  })

  it("excludes soft-deleted by default; includes them with ?includeInactive=true", async () => {
    const owner = await setUpOwnerWithStore()
    const subcategoryId = await subForOwner(owner)
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, subcategoryId, name: "ToDelete" })
    await api()
      .delete(`/v1/stores/me/products/${created.body.data.product.id}`)
      .set("Cookie", owner.cookieHeader)

    const list = await api()
      .get("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
    expect(list.body.data.items.find((p: { name: string }) => p.name === "ToDelete")).toBeUndefined()

    const listAll = await api()
      .get("/v1/stores/me/products?includeInactive=true")
      .set("Cookie", owner.cookieHeader)
    const found = listAll.body.data.items.find((p: { name: string }) => p.name === "ToDelete")
    expect(found).toBeDefined()
    expect(found.isActive).toBe(false)
  })
})

describe("GET / PATCH / DELETE / restore /products/:id", () => {
  it("get works on own product", async () => {
    const owner = await setUpOwnerWithStore()
    const subcategoryId = await subForOwner(owner)
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, subcategoryId })
    const id = created.body.data.product.id

    const res = await api()
      .get(`/v1/stores/me/products/${id}`)
      .set("Cookie", owner.cookieHeader)
    expect(res.status).toBe(200)
    expect(res.body.data.product.id).toBe(id)
  })

  it("get returns 404 for another owner's product (IDOR check)", async () => {
    const ownerA = await setUpOwnerWithStore("Owner A")
    const subA = await subForOwner(ownerA)
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", ownerA.cookieHeader)
      .send({ ...baseProductBody, subcategoryId: subA })
    const idOfA = created.body.data.product.id

    const ownerB = await signupApprovedOwner(app, "Owner B")
    await api()
      .post("/v1/stores/me")
      .set("Cookie", ownerB.cookieHeader)
      .send({ ...baseStoreBody, phone: "+919999333333" })

    const res = await api()
      .get(`/v1/stores/me/products/${idOfA}`)
      .set("Cookie", ownerB.cookieHeader)
    expect(res.status).toBe(404)
  })

  it("patch price + isAvailable", async () => {
    const owner = await setUpOwnerWithStore()
    const subcategoryId = await subForOwner(owner)
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, subcategoryId })
    const id = created.body.data.product.id

    const res = await api()
      .patch(`/v1/stores/me/products/${id}`)
      .set("Cookie", owner.cookieHeader)
      .send({ pricePaise: 34000, isAvailable: false })
    expect(res.status).toBe(200)
    expect(res.body.data.product.pricePaise).toBe(34000)
    expect(res.body.data.product.isAvailable).toBe(false)
  })

  it("PATCH no longer accepts subcategoryId — strict 400 (use /move instead)", async () => {
    const owner = await setUpOwnerWithStore()
    const subcategoryId = await subForOwner(owner)
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, subcategoryId })
    const id = created.body.data.product.id

    const res = await api()
      .patch(`/v1/stores/me/products/${id}`)
      .set("Cookie", owner.cookieHeader)
      .send({ subcategoryId: "anything" })
    expect(res.status).toBe(400)
  })

  it("POST /:id/move relocates a product to a different sub in the same store", async () => {
    const owner = await setUpOwnerWithStore()
    const cats = await prisma.category.findMany({ take: 2, orderBy: { displayOrder: "asc" } })
    const subA = await ensureSubcategoryForOwner(owner, cats[0]!.id)
    const subB = await ensureSubcategoryForOwner(owner, cats[1]!.id)

    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, subcategoryId: subA })
    const id = created.body.data.product.id

    const moved = await api()
      .post(`/v1/stores/me/products/${id}/move`)
      .set("Cookie", owner.cookieHeader)
      .send({ subcategoryId: subB })
    expect(moved.status).toBe(200)
    expect(moved.body.data.product.subcategoryId).toBe(subB)
  })

  it("POST /:id/move to a foreign sub → 400 (cross-store IDOR blocked)", async () => {
    const ownerA = await setUpOwnerWithStore("MA")
    const ownerB = await signupApprovedOwner(app, "MB")
    await api()
      .post("/v1/stores/me")
      .set("Cookie", ownerB.cookieHeader)
      .send({ ...baseStoreBody, phone: "+919999555555" })
    const subOfB = await subForOwner(ownerB)
    const subOfA = await subForOwner(ownerA)

    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", ownerA.cookieHeader)
      .send({ ...baseProductBody, subcategoryId: subOfA })
    const idA = created.body.data.product.id

    const res = await api()
      .post(`/v1/stores/me/products/${idA}/move`)
      .set("Cookie", ownerA.cookieHeader)
      .send({ subcategoryId: subOfB })
    expect(res.status).toBe(400)
  })

  it("soft delete then restore round-trips, both idempotent", async () => {
    const owner = await setUpOwnerWithStore()
    const subcategoryId = await subForOwner(owner)
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({ ...baseProductBody, subcategoryId })
    const id = created.body.data.product.id

    const del1 = await api()
      .delete(`/v1/stores/me/products/${id}`)
      .set("Cookie", owner.cookieHeader)
    expect(del1.status).toBe(200)
    expect(del1.body.data.product.isActive).toBe(false)

    const del2 = await api()
      .delete(`/v1/stores/me/products/${id}`)
      .set("Cookie", owner.cookieHeader)
    expect(del2.status).toBe(200)

    const restored = await api()
      .post(`/v1/stores/me/products/${id}/restore`)
      .set("Cookie", owner.cookieHeader)
    expect(restored.status).toBe(200)
    expect(restored.body.data.product.isActive).toBe(true)

    const restored2 = await api()
      .post(`/v1/stores/me/products/${id}/restore`)
      .set("Cookie", owner.cookieHeader)
    expect(restored2.status).toBe(200)
  })

  it("delete/restore on someone else's product → 404", async () => {
    const ownerA = await setUpOwnerWithStore("DA Owner")
    const subA = await subForOwner(ownerA)
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", ownerA.cookieHeader)
      .send({ ...baseProductBody, subcategoryId: subA })
    const idOfA = created.body.data.product.id

    const ownerB = await signupApprovedOwner(app, "DB Owner")
    await api()
      .post("/v1/stores/me")
      .set("Cookie", ownerB.cookieHeader)
      .send({ ...baseStoreBody, phone: "+919999444444" })

    const res = await api()
      .delete(`/v1/stores/me/products/${idOfA}`)
      .set("Cookie", ownerB.cookieHeader)
    expect(res.status).toBe(404)
  })
})

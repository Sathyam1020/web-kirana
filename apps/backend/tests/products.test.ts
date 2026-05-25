/**
 * Phase 4.1 integration tests — owner-side product CRUD + cross-owner
 * isolation + role gating.
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
  await api().post("/v1/stores/me").set("Authorization", owner.bearer).send(baseStoreBody)
  return owner
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
  it("creates a product when store + category exist", async () => {
    const owner = await setUpOwnerWithStore()
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, categoryId })
    expect(res.status).toBe(201)
    expect(res.body.data.product).toMatchObject({
      name: baseProductBody.name,
      pricePaise: baseProductBody.pricePaise,
      unit: "KG",
      isActive: true,
      isAvailable: true,
      categoryId,
    })
    expect(typeof res.body.data.product.categoryName).toBe("string")
  })

  it("404 STORE_NOT_CREATED if owner has no store", async () => {
    const owner = await signupApprovedOwner(app)
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, categoryId })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("STORE_NOT_CREATED")
  })

  it("400 on bogus categoryId (clean message, not P2003)", async () => {
    const owner = await setUpOwnerWithStore()
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, categoryId: "does-not-exist-zzz" })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
    expect(res.body.error.message).toMatch(/[Cc]ategory/)
  })

  it("400 on negative price", async () => {
    const owner = await setUpOwnerWithStore()
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, categoryId, pricePaise: -1 })
    expect(res.status).toBe(400)
  })

  it("400 on price below ₹1 floor", async () => {
    const owner = await setUpOwnerWithStore()
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, categoryId, pricePaise: 50 })
    expect(res.status).toBe(400)
  })

  it("400 on non-integer price", async () => {
    const owner = await setUpOwnerWithStore()
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, categoryId, pricePaise: 99.5 })
    expect(res.status).toBe(400)
  })

  it("400 on invalid Unit", async () => {
    const owner = await setUpOwnerWithStore()
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, categoryId, unit: "STONE" })
    expect(res.status).toBe(400)
  })

  it("customer is denied 403", async () => {
    const customer = await signupCustomer(app)
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", customer.bearer)
      .send({ ...baseProductBody, categoryId })
    expect(res.status).toBe(403)
  })
})

describe("GET /v1/stores/me/products", () => {
  it("lists products from this owner only, paginated", async () => {
    const owner = await setUpOwnerWithStore()
    // Create 3 products
    for (let i = 0; i < 3; i++) {
      await api()
        .post("/v1/stores/me/products")
        .set("Authorization", owner.bearer)
        .send({ ...baseProductBody, name: `P${i}`, categoryId })
    }
    const res = await api()
      .get("/v1/stores/me/products?limit=2")
      .set("Authorization", owner.bearer)
    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBe(2)
    expect(res.body.data.hasMore).toBe(true)
    expect(typeof res.body.data.nextCursor).toBe("string")

    const page2 = await api()
      .get(`/v1/stores/me/products?limit=2&cursor=${res.body.data.nextCursor}`)
      .set("Authorization", owner.bearer)
    expect(page2.status).toBe(200)
    expect(page2.body.data.items.length).toBe(1)
    expect(page2.body.data.hasMore).toBe(false)
  })

  it("filters by category and availability", async () => {
    const owner = await setUpOwnerWithStore()
    const cats = await prisma.category.findMany({ take: 2, orderBy: { displayOrder: "asc" } })
    const catA = cats[0]!.id
    const catB = cats[1]!.id

    await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, name: "PA1", categoryId: catA })
    await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, name: "PB1", categoryId: catB, isAvailable: false })

    const byA = await api()
      .get(`/v1/stores/me/products?category=${catA}`)
      .set("Authorization", owner.bearer)
    expect(byA.body.data.items.length).toBe(1)
    expect(byA.body.data.items[0].name).toBe("PA1")

    const onlyAvail = await api()
      .get("/v1/stores/me/products?available=true")
      .set("Authorization", owner.bearer)
    expect(onlyAvail.body.data.items.map((p: { name: string }) => p.name).sort()).toEqual(["PA1"])

    const onlyUnavail = await api()
      .get("/v1/stores/me/products?available=false")
      .set("Authorization", owner.bearer)
    expect(onlyUnavail.body.data.items.map((p: { name: string }) => p.name)).toEqual(["PB1"])
  })

  it("400 when ?category= points at a non-existent category", async () => {
    const owner = await setUpOwnerWithStore()
    const res = await api()
      .get("/v1/stores/me/products?category=does-not-exist-zzz")
      .set("Authorization", owner.bearer)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
  })

  it("excludes soft-deleted by default; includes them with ?includeInactive=true", async () => {
    const owner = await setUpOwnerWithStore()
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, categoryId, name: "ToDelete" })
    await api()
      .delete(`/v1/stores/me/products/${created.body.data.product.id}`)
      .set("Authorization", owner.bearer)

    const list = await api()
      .get("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
    expect(list.body.data.items.find((p: { name: string }) => p.name === "ToDelete")).toBeUndefined()

    const listAll = await api()
      .get("/v1/stores/me/products?includeInactive=true")
      .set("Authorization", owner.bearer)
    const found = listAll.body.data.items.find((p: { name: string }) => p.name === "ToDelete")
    expect(found).toBeDefined()
    expect(found.isActive).toBe(false)
  })
})

describe("GET / PATCH / DELETE / restore /products/:id", () => {
  it("get works on own product", async () => {
    const owner = await setUpOwnerWithStore()
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, categoryId })
    const id = created.body.data.product.id

    const res = await api()
      .get(`/v1/stores/me/products/${id}`)
      .set("Authorization", owner.bearer)
    expect(res.status).toBe(200)
    expect(res.body.data.product.id).toBe(id)
  })

  it("get returns 404 for another owner's product (IDOR check)", async () => {
    const ownerA = await setUpOwnerWithStore("Owner A")
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", ownerA.bearer)
      .send({ ...baseProductBody, categoryId })
    const idOfA = created.body.data.product.id

    const ownerB = await signupApprovedOwner(app, "Owner B")
    await api()
      .post("/v1/stores/me")
      .set("Authorization", ownerB.bearer)
      .send({ ...baseStoreBody, phone: "+919999333333" })

    const res = await api()
      .get(`/v1/stores/me/products/${idOfA}`)
      .set("Authorization", ownerB.bearer)
    expect(res.status).toBe(404)
  })

  it("patch price + isAvailable", async () => {
    const owner = await setUpOwnerWithStore()
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, categoryId })
    const id = created.body.data.product.id

    const res = await api()
      .patch(`/v1/stores/me/products/${id}`)
      .set("Authorization", owner.bearer)
      .send({ pricePaise: 34000, isAvailable: false })
    expect(res.status).toBe(200)
    expect(res.body.data.product.pricePaise).toBe(34000)
    expect(res.body.data.product.isAvailable).toBe(false)
  })

  it("patch with invalid categoryId returns 400", async () => {
    const owner = await setUpOwnerWithStore()
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, categoryId })
    const id = created.body.data.product.id

    const res = await api()
      .patch(`/v1/stores/me/products/${id}`)
      .set("Authorization", owner.bearer)
      .send({ categoryId: "nope-zzz" })
    expect(res.status).toBe(400)
  })

  it("soft delete then restore round-trips, both idempotent", async () => {
    const owner = await setUpOwnerWithStore()
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", owner.bearer)
      .send({ ...baseProductBody, categoryId })
    const id = created.body.data.product.id

    const del1 = await api()
      .delete(`/v1/stores/me/products/${id}`)
      .set("Authorization", owner.bearer)
    expect(del1.status).toBe(200)
    expect(del1.body.data.product.isActive).toBe(false)

    // Idempotent second delete still 200
    const del2 = await api()
      .delete(`/v1/stores/me/products/${id}`)
      .set("Authorization", owner.bearer)
    expect(del2.status).toBe(200)

    const restored = await api()
      .post(`/v1/stores/me/products/${id}/restore`)
      .set("Authorization", owner.bearer)
    expect(restored.status).toBe(200)
    expect(restored.body.data.product.isActive).toBe(true)

    // Idempotent second restore
    const restored2 = await api()
      .post(`/v1/stores/me/products/${id}/restore`)
      .set("Authorization", owner.bearer)
    expect(restored2.status).toBe(200)
  })

  it("delete/restore on someone else's product → 404", async () => {
    const ownerA = await setUpOwnerWithStore("DA Owner")
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Authorization", ownerA.bearer)
      .send({ ...baseProductBody, categoryId })
    const idOfA = created.body.data.product.id

    const ownerB = await signupApprovedOwner(app, "DB Owner")
    await api()
      .post("/v1/stores/me")
      .set("Authorization", ownerB.bearer)
      .send({ ...baseStoreBody, phone: "+919999444444" })

    const res = await api()
      .delete(`/v1/stores/me/products/${idOfA}`)
      .set("Authorization", ownerB.bearer)
    expect(res.status).toBe(404)
  })
})

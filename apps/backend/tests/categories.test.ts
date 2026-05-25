/**
 * Phase 4.1 integration tests — categories.
 *
 * Public list is open. Admin-only create/update. Customer + owner cannot
 * manage. Duplicate names rejected. Categories live in the seed DB; tests
 * create rows with the ZZZ-TEST- name prefix so cleanupRun() removes them.
 */

import { afterAll, describe, expect, it } from "vitest"
import request from "supertest"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/db/prisma.js"
import {
  cleanupRun,
  loginSeededAdmin,
  nextCategoryName,
  signupApprovedOwner,
  signupCustomer,
} from "./helpers/factories.js"

const app = buildApp()
const api = () => request(app)

afterAll(async () => {
  await cleanupRun()
  await prisma.$disconnect()
})

describe("GET /v1/categories (public)", () => {
  it("returns the seeded categories without auth", async () => {
    const res = await api().get("/v1/categories")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.categories)).toBe(true)
    expect(res.body.data.categories.length).toBeGreaterThan(0)
    // Sorted by displayOrder asc then name
    const orders = res.body.data.categories.map((c: { displayOrder: number }) => c.displayOrder)
    const sorted = [...orders].sort((a, b) => a - b)
    expect(orders).toEqual(sorted)
  })

  it("public router is read-only — anonymous POST /v1/categories is 404", async () => {
    const res = await api()
      .post("/v1/categories")
      .send({ name: "should-fail" })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("NOT_FOUND")
  })
})

describe("POST /v1/admin/categories", () => {
  it("admin creates a category", async () => {
    const admin = await loginSeededAdmin(app)
    const name = nextCategoryName("Create")
    const res = await api()
      .post("/v1/admin/categories")
      .set("Authorization", admin.bearer)
      .send({ name, displayOrder: 50 })
    expect(res.status).toBe(201)
    expect(res.body.data.category).toMatchObject({ name, displayOrder: 50 })
  })

  it("rejects duplicate name 409", async () => {
    const admin = await loginSeededAdmin(app)
    const name = nextCategoryName("Dup")
    const first = await api()
      .post("/v1/admin/categories")
      .set("Authorization", admin.bearer)
      .send({ name })
    expect(first.status).toBe(201)

    const second = await api()
      .post("/v1/admin/categories")
      .set("Authorization", admin.bearer)
      .send({ name })
    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe("CONFLICT")
  })

  it("customer is denied 403", async () => {
    const customer = await signupCustomer(app)
    const res = await api()
      .post("/v1/admin/categories")
      .set("Authorization", customer.bearer)
      .send({ name: nextCategoryName("CustTry") })
    expect(res.status).toBe(403)
  })

  it("owner is denied 403", async () => {
    const owner = await signupApprovedOwner(app)
    const res = await api()
      .post("/v1/admin/categories")
      .set("Authorization", owner.bearer)
      .send({ name: nextCategoryName("OwnerTry") })
    expect(res.status).toBe(403)
  })

  it("anonymous is denied 401", async () => {
    const res = await api()
      .post("/v1/admin/categories")
      .send({ name: nextCategoryName("AnonTry") })
    expect(res.status).toBe(401)
  })
})

describe("PATCH /v1/admin/categories/:id", () => {
  it("admin renames a category", async () => {
    const admin = await loginSeededAdmin(app)
    const original = nextCategoryName("Original")
    const created = await api()
      .post("/v1/admin/categories")
      .set("Authorization", admin.bearer)
      .send({ name: original })
    const id = created.body.data.category.id

    const renamed = nextCategoryName("Renamed")
    const res = await api()
      .patch(`/v1/admin/categories/${id}`)
      .set("Authorization", admin.bearer)
      .send({ name: renamed })
    expect(res.status).toBe(200)
    expect(res.body.data.category.name).toBe(renamed)
  })

  it("rejects rename to existing name (409)", async () => {
    const admin = await loginSeededAdmin(app)
    const a = await api()
      .post("/v1/admin/categories")
      .set("Authorization", admin.bearer)
      .send({ name: nextCategoryName("A") })
    const b = await api()
      .post("/v1/admin/categories")
      .set("Authorization", admin.bearer)
      .send({ name: nextCategoryName("B") })

    const res = await api()
      .patch(`/v1/admin/categories/${b.body.data.category.id}`)
      .set("Authorization", admin.bearer)
      .send({ name: a.body.data.category.name })
    expect(res.status).toBe(409)
  })

  it("404 on unknown id", async () => {
    const admin = await loginSeededAdmin(app)
    const res = await api()
      .patch("/v1/admin/categories/nonexistent-zzz")
      .set("Authorization", admin.bearer)
      .send({ name: nextCategoryName("X") })
    expect(res.status).toBe(404)
  })

  it("non-admin denied 403", async () => {
    const admin = await loginSeededAdmin(app)
    const created = await api()
      .post("/v1/admin/categories")
      .set("Authorization", admin.bearer)
      .send({ name: nextCategoryName("Locked") })
    const id = created.body.data.category.id

    const owner = await signupApprovedOwner(app)
    const res = await api()
      .patch(`/v1/admin/categories/${id}`)
      .set("Authorization", owner.bearer)
      .send({ name: nextCategoryName("Hijacked") })
    expect(res.status).toBe(403)
  })
})

/**
 * Phase 6 integration tests — customer address book CRUD.
 *
 * Hits the real Neon DB. Per-run phone prefix scopes test users; cleanupRun
 * cascades through Address via User onDelete: Cascade.
 *
 * Coverage:
 *  POST /v1/addresses                 create + first-address auto-default + cap + auth
 *  GET  /v1/addresses                 list ordering + cross-customer isolation
 *  GET  /v1/addresses/:id             own vs. someone else's
 *  PATCH /v1/addresses/:id            partial + null clears line2 + strict isDefault rejection
 *  DELETE /v1/addresses/:id           delete-default promotes sibling; delete-last is fine
 *  POST /v1/addresses/:id/default     atomic flip + idempotent on already-default
 */

import { afterAll, describe, expect, it } from "vitest"
import request from "supertest"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/db/prisma.js"
import {
  cleanupRun,
  loginSeededAdmin,
  signupApprovedOwner,
  signupCustomer,
} from "./helpers/factories.js"

const app = buildApp()
const api = () => request(app)

afterAll(async () => {
  await cleanupRun()
  await prisma.$disconnect()
})

const baseAddress = {
  label: "Home",
  line1: "23, 27th Main, HSR Layout Sector 2",
  line2: "Near the temple",
  city: "Bengaluru",
  pincode: "560102",
  latitude: 12.9116,
  longitude: 77.6473,
}

// --- POST /v1/addresses -----------------------------------------------

describe("POST /v1/addresses", () => {
  it("anonymous → 401", async () => {
    const res = await api().post("/v1/addresses").send(baseAddress)
    expect(res.status).toBe(401)
  })

  it("owner → 403 (customer-only)", async () => {
    const owner = await signupApprovedOwner(app)
    const res = await api()
      .post("/v1/addresses")
      .set("Authorization", owner.bearer)
      .send(baseAddress)
    expect(res.status).toBe(403)
  })

  it("admin → 403", async () => {
    const admin = await loginSeededAdmin(app)
    const res = await api()
      .post("/v1/addresses")
      .set("Authorization", admin.bearer)
      .send(baseAddress)
    expect(res.status).toBe(403)
  })

  it("creates the first address with isDefault=true (auto-promoted regardless of input)", async () => {
    const customer = await signupCustomer(app)
    const res = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send({ ...baseAddress, isDefault: false })
    expect(res.status).toBe(201)
    expect(res.body.data.address.isDefault).toBe(true)
    expect(res.body.data.address.label).toBe("Home")
    expect(typeof res.body.data.address.latitude).toBe("string")
    expect(typeof res.body.data.address.longitude).toBe("string")
    expect(res.body.data.address.line2).toBe("Near the temple")
  })

  it("second address: isDefault=false unless explicitly requested", async () => {
    const customer = await signupCustomer(app)
    await api().post("/v1/addresses").set("Authorization", customer.bearer).send(baseAddress)
    const second = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send({ ...baseAddress, label: "Office" })
    expect(second.status).toBe(201)
    expect(second.body.data.address.isDefault).toBe(false)
  })

  it("second address with isDefault=true clears the prior default", async () => {
    const customer = await signupCustomer(app)
    const first = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send(baseAddress)
    const second = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send({ ...baseAddress, label: "Office", isDefault: true })
    expect(second.body.data.address.isDefault).toBe(true)

    const firstAfter = await api()
      .get(`/v1/addresses/${first.body.data.address.id}`)
      .set("Authorization", customer.bearer)
    expect(firstAfter.body.data.address.isDefault).toBe(false)
  })

  it("21st create → 409 MAX_ADDRESSES_REACHED", async () => {
    const customer = await signupCustomer(app)
    // Seed 20 addresses directly via Prisma in a single createMany so we
    // don't burn 20 sequential Neon round-trips (each take ~1s — would
    // blow the test budget). The cap is enforced in the service layer
    // regardless of how the prior 20 got there.
    await prisma.address.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        customerId: customer.user.id,
        label: `Seeded-${i}`,
        line1: "addr",
        city: "Bengaluru",
        pincode: "560102",
        latitude: "12.9116",
        longitude: "77.6473",
        // Keep all NON-default; the cap check in createAddress doesn't
        // depend on isDefault and the partial unique index won't fire.
        isDefault: false,
      })),
    })
    const overflow = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send({ ...baseAddress, label: "21st" })
    expect(overflow.status).toBe(409)
    expect(overflow.body.error.code).toBe("MAX_ADDRESSES_REACHED")
  })

  it("400 on invalid latitude", async () => {
    const customer = await signupCustomer(app)
    const res = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send({ ...baseAddress, latitude: 99 })
    expect(res.status).toBe(400)
  })

  it("400 on unknown field (strict object)", async () => {
    const customer = await signupCustomer(app)
    const res = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send({ ...baseAddress, mystery: 1 })
    expect(res.status).toBe(400)
  })
})

// --- GET /v1/addresses -------------------------------------------------

describe("GET /v1/addresses", () => {
  it("empty list returns []", async () => {
    const customer = await signupCustomer(app)
    const res = await api().get("/v1/addresses").set("Authorization", customer.bearer)
    expect(res.status).toBe(200)
    expect(res.body.data.items).toEqual([])
  })

  it("default first, then createdAt DESC", async () => {
    const customer = await signupCustomer(app)
    const a = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send({ ...baseAddress, label: "A" })
    const b = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send({ ...baseAddress, label: "B" })
    const c = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send({ ...baseAddress, label: "C", isDefault: true })

    const list = await api().get("/v1/addresses").set("Authorization", customer.bearer)
    expect(list.status).toBe(200)
    const ids = (list.body.data.items as { id: string }[]).map((it) => it.id)
    expect(ids).toEqual([c.body.data.address.id, b.body.data.address.id, a.body.data.address.id])
  })

  it("cross-customer isolation: B never sees A's addresses", async () => {
    const customerA = await signupCustomer(app, "A")
    await api().post("/v1/addresses").set("Authorization", customerA.bearer).send(baseAddress)
    const customerB = await signupCustomer(app, "B")
    const list = await api().get("/v1/addresses").set("Authorization", customerB.bearer)
    expect(list.body.data.items).toEqual([])
  })
})

// --- GET /v1/addresses/:id ---------------------------------------------

describe("GET /v1/addresses/:id", () => {
  it("returns the caller's own address", async () => {
    const customer = await signupCustomer(app)
    const create = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send(baseAddress)
    const res = await api()
      .get(`/v1/addresses/${create.body.data.address.id}`)
      .set("Authorization", customer.bearer)
    expect(res.status).toBe(200)
    expect(res.body.data.address.id).toBe(create.body.data.address.id)
  })

  it("404 for someone else's address id (no enumeration)", async () => {
    const customerA = await signupCustomer(app, "A")
    const create = await api().post("/v1/addresses").set("Authorization", customerA.bearer).send(baseAddress)
    const customerB = await signupCustomer(app, "B")
    const res = await api()
      .get(`/v1/addresses/${create.body.data.address.id}`)
      .set("Authorization", customerB.bearer)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("NOT_FOUND")
  })
})

// --- PATCH /v1/addresses/:id -------------------------------------------

describe("PATCH /v1/addresses/:id", () => {
  it("partial update preserves untouched fields", async () => {
    const customer = await signupCustomer(app)
    const create = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send(baseAddress)
    const res = await api()
      .patch(`/v1/addresses/${create.body.data.address.id}`)
      .set("Authorization", customer.bearer)
      .send({ label: "Work" })
    expect(res.status).toBe(200)
    expect(res.body.data.address.label).toBe("Work")
    expect(res.body.data.address.city).toBe("Bengaluru")
    expect(res.body.data.address.line1).toBe(baseAddress.line1)
  })

  it("null clears line2", async () => {
    const customer = await signupCustomer(app)
    const create = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send(baseAddress)
    const res = await api()
      .patch(`/v1/addresses/${create.body.data.address.id}`)
      .set("Authorization", customer.bearer)
      .send({ line2: null })
    expect(res.status).toBe(200)
    expect(res.body.data.address.line2).toBeNull()
  })

  it("400 when isDefault is in the body (strict — use /default endpoint instead)", async () => {
    const customer = await signupCustomer(app)
    const create = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send(baseAddress)
    const res = await api()
      .patch(`/v1/addresses/${create.body.data.address.id}`)
      .set("Authorization", customer.bearer)
      .send({ isDefault: true })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
  })

  it("404 for someone else's address id", async () => {
    const customerA = await signupCustomer(app, "A")
    const create = await api().post("/v1/addresses").set("Authorization", customerA.bearer).send(baseAddress)
    const customerB = await signupCustomer(app, "B")
    const res = await api()
      .patch(`/v1/addresses/${create.body.data.address.id}`)
      .set("Authorization", customerB.bearer)
      .send({ label: "Pwned" })
    expect(res.status).toBe(404)
  })
})

// --- DELETE /v1/addresses/:id ------------------------------------------

describe("DELETE /v1/addresses/:id", () => {
  it("deletes the address; if it was default and siblings exist, promote next-newest", async () => {
    const customer = await signupCustomer(app)
    const first = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send({ ...baseAddress, label: "A" })
    const second = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send({ ...baseAddress, label: "B" })
    // first is the default (auto-default on first create).
    expect(first.body.data.address.isDefault).toBe(true)

    const del = await api()
      .delete(`/v1/addresses/${first.body.data.address.id}`)
      .set("Authorization", customer.bearer)
    expect(del.status).toBe(204)

    // The remaining sibling (second) should now be the default.
    const remaining = await api()
      .get(`/v1/addresses/${second.body.data.address.id}`)
      .set("Authorization", customer.bearer)
    expect(remaining.body.data.address.isDefault).toBe(true)
  })

  it("deletes the last (and only) address with no promotion error", async () => {
    const customer = await signupCustomer(app)
    const create = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send(baseAddress)
    const del = await api()
      .delete(`/v1/addresses/${create.body.data.address.id}`)
      .set("Authorization", customer.bearer)
    expect(del.status).toBe(204)
    const list = await api().get("/v1/addresses").set("Authorization", customer.bearer)
    expect(list.body.data.items).toEqual([])
  })

  it("404 for someone else's address id", async () => {
    const customerA = await signupCustomer(app, "A")
    const create = await api().post("/v1/addresses").set("Authorization", customerA.bearer).send(baseAddress)
    const customerB = await signupCustomer(app, "B")
    const res = await api()
      .delete(`/v1/addresses/${create.body.data.address.id}`)
      .set("Authorization", customerB.bearer)
    expect(res.status).toBe(404)
  })
})

// --- POST /v1/addresses/:id/default ------------------------------------

describe("POST /v1/addresses/:id/default", () => {
  it("clears the prior default and sets this one", async () => {
    const customer = await signupCustomer(app)
    const a = await api().post("/v1/addresses").set("Authorization", customer.bearer).send({ ...baseAddress, label: "A" })
    const b = await api().post("/v1/addresses").set("Authorization", customer.bearer).send({ ...baseAddress, label: "B" })
    expect(a.body.data.address.isDefault).toBe(true)
    expect(b.body.data.address.isDefault).toBe(false)

    const flip = await api()
      .post(`/v1/addresses/${b.body.data.address.id}/default`)
      .set("Authorization", customer.bearer)
    expect(flip.status).toBe(200)
    expect(flip.body.data.address.isDefault).toBe(true)

    const aAfter = await api()
      .get(`/v1/addresses/${a.body.data.address.id}`)
      .set("Authorization", customer.bearer)
    expect(aAfter.body.data.address.isDefault).toBe(false)
  })

  it("idempotent on already-default", async () => {
    const customer = await signupCustomer(app)
    const create = await api().post("/v1/addresses").set("Authorization", customer.bearer).send(baseAddress)
    expect(create.body.data.address.isDefault).toBe(true)
    const repeat = await api()
      .post(`/v1/addresses/${create.body.data.address.id}/default`)
      .set("Authorization", customer.bearer)
    expect(repeat.status).toBe(200)
    expect(repeat.body.data.address.isDefault).toBe(true)
  })

  it("404 for someone else's address id", async () => {
    const customerA = await signupCustomer(app, "A")
    const create = await api().post("/v1/addresses").set("Authorization", customerA.bearer).send(baseAddress)
    const customerB = await signupCustomer(app, "B")
    const res = await api()
      .post(`/v1/addresses/${create.body.data.address.id}/default`)
      .set("Authorization", customerB.bearer)
    expect(res.status).toBe(404)
  })

  it("DB-side enforces at-most-one default per customer (partial unique index)", async () => {
    // Verify the constraint EXISTS by directly poking Prisma — the service
    // layer always clears first, but the index is the safety net for
    // concurrent calls. We can't reliably exercise the race in a sequential
    // integration test; instead we verify the constraint by attempting a
    // direct double-default INSERT through Prisma and catching the error.
    const customer = await signupCustomer(app)
    const created = await api()
      .post("/v1/addresses")
      .set("Authorization", customer.bearer)
      .send(baseAddress)

    let p2002 = false
    try {
      await prisma.address.create({
        data: {
          customerId: customer.user.id,
          label: "Duplicate",
          line1: "addr",
          city: "X",
          pincode: "123",
          latitude: "12.0",
          longitude: "77.0",
          isDefault: true,
        },
      })
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === "P2002") p2002 = true
    }
    expect(p2002).toBe(true)
    // First default still wins.
    const list = await api().get("/v1/addresses").set("Authorization", customer.bearer)
    expect(
      (list.body.data.items as { id: string; isDefault: boolean }[]).filter((a) => a.isDefault).length,
    ).toBe(1)
    expect(
      (list.body.data.items as { id: string; isDefault: boolean }[]).find((a) => a.isDefault)!.id,
    ).toBe(created.body.data.address.id)
  })
})

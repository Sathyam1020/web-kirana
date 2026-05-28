/**
 * Phase 8 — order lifecycle transitions: owner accept/reject/out-for-delivery/
 * deliver, customer cancel, invalid-transition + double-tap guards, scoping,
 * and the full happy path with a complete status history. See PHASE8.md.
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
  signupApprovedOwner,
  signupCustomer,
} from "./helpers/factories.js"

const app = buildApp()
const api = () => request(app)

const STORE_LAT = 12.9116
const STORE_LNG = 77.6473

let categoryId: string

async function newOpenStore(phone: string): Promise<{ owner: AuthedCaller; subId: string }> {
  const owner = await signupApprovedOwner(app, "Lifecycle Owner")
  await api()
    .post("/v1/stores/me")
    .set("Cookie", owner.cookieHeader)
    .send({
      name: "Lifecycle Store",
      phone,
      latitude: STORE_LAT,
      longitude: STORE_LNG,
      addressLine: "addr",
      city: "Bengaluru",
      pincode: "560102",
    })
  await api().patch("/v1/stores/me/open").set("Cookie", owner.cookieHeader).send({ isOpen: true })
  const subId = await ensureSubcategoryForOwner(owner, categoryId)
  return { owner, subId }
}

let store: { owner: AuthedCaller; subId: string }
let productA: string
let customer: AuthedCaller
let nearAddress: string

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow({ orderBy: { displayOrder: "asc" } })).id
  store = await newOpenStore("+919991000001")
  const p = await api()
    .post("/v1/stores/me/products")
    .set("Cookie", store.owner.cookieHeader)
    .send({ subcategoryId: store.subId, name: "Lifecycle Item", pricePaise: 10000, unit: "PIECE" })
  productA = p.body.data.product.id
  customer = await signupCustomer(app, "Lifecycle Customer")
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

const oCookie = () => store.owner.cookieHeader
const accept = (id: string) => api().post(`/v1/stores/me/orders/${id}/accept`).set("Cookie", oCookie())
const reject = (id: string, body: object = { reason: "out of stock" }) =>
  api().post(`/v1/stores/me/orders/${id}/reject`).set("Cookie", oCookie()).send(body)
const ofd = (id: string) => api().post(`/v1/stores/me/orders/${id}/out-for-delivery`).set("Cookie", oCookie())
const deliver = (id: string) => api().post(`/v1/stores/me/orders/${id}/deliver`).set("Cookie", oCookie())
const cancel = (id: string, c: AuthedCaller = customer) =>
  api().post(`/v1/orders/${id}/cancel`).set("Cookie", c.cookieHeader).send({})

describe("owner transitions", () => {
  it("accept: PLACED → ACCEPTED with timestamp + history", async () => {
    const id = await freshOrder()
    const res = await accept(id)
    expect(res.status).toBe(200)
    expect(res.body.data.order.status).toBe("ACCEPTED")
    expect(res.body.data.order.acceptedAt).not.toBeNull()
    const hist = await prisma.orderStatusHistory.count({ where: { orderId: id, toStatus: "ACCEPTED" } })
    expect(hist).toBe(1)
  })

  it("reject: stores the reason", async () => {
    const id = await freshOrder()
    const res = await reject(id, { reason: "closing early" })
    expect(res.status).toBe(200)
    expect(res.body.data.order.status).toBe("REJECTED")
    expect(res.body.data.order.rejectionReason).toBe("closing early")
  })

  it("reject without a reason → 400", async () => {
    const id = await freshOrder()
    const res = await reject(id, {})
    expect(res.status).toBe(400)
  })

  it("out-for-delivery: ACCEPTED → OUT_FOR_DELIVERY", async () => {
    const id = await freshOrder()
    await accept(id)
    const res = await ofd(id)
    expect(res.status).toBe(200)
    expect(res.body.data.order.status).toBe("OUT_FOR_DELIVERY")
  })

  it("deliver: → DELIVERED and payment COLLECTED", async () => {
    const id = await freshOrder()
    await accept(id)
    await ofd(id)
    const res = await deliver(id)
    expect(res.status).toBe(200)
    expect(res.body.data.order.status).toBe("DELIVERED")
    expect(res.body.data.order.paymentStatus).toBe("COLLECTED")
  })

  it("invalid transition (deliver from PLACED) → 409", async () => {
    const id = await freshOrder()
    const res = await deliver(id)
    expect(res.status).toBe(409)
  })

  it("double accept → second is 409", async () => {
    const id = await freshOrder()
    expect((await accept(id)).status).toBe(200)
    expect((await accept(id)).status).toBe(409)
  })

  it("can't transition another store's order → 404", async () => {
    const id = await freshOrder()
    const other = await newOpenStore("+919991000002")
    const res = await api().post(`/v1/stores/me/orders/${id}/accept`).set("Cookie", other.owner.cookieHeader)
    expect(res.status).toBe(404)
  })

  it("full happy path leaves a 4-row history", async () => {
    const id = await freshOrder()
    await accept(id)
    await ofd(id)
    await deliver(id)
    const count = await prisma.orderStatusHistory.count({ where: { orderId: id } })
    expect(count).toBe(4) // PLACED + ACCEPTED + OUT_FOR_DELIVERY + DELIVERED
  })
})

describe("customer cancel", () => {
  it("cancels while PLACED", async () => {
    const id = await freshOrder()
    const res = await cancel(id)
    expect(res.status).toBe(200)
    expect(res.body.data.order.status).toBe("CANCELLED")
  })

  it("can't cancel after the owner accepts → 409", async () => {
    const id = await freshOrder()
    await accept(id)
    const res = await cancel(id)
    expect(res.status).toBe(409)
  })

  it("can't cancel another customer's order → 404", async () => {
    const id = await freshOrder()
    const other = await signupCustomer(app, "Other Customer")
    const res = await cancel(id, other)
    expect(res.status).toBe(404)
  })
})

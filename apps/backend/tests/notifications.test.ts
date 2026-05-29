/**
 * Phase 10 — notifications. Exercises the dispatch routing (which recipient +
 * channel per event), the push subscribe endpoints, and the WhatsApp webhook
 * signature/verify. WhatsApp + web-push are unconfigured in the test env, so
 * the observable side-effect is the WhatsAppMessageLog outbox row (written even
 * when unconfigured, marked FAILED) — that's what we assert routing against.
 * See PHASE10.md.
 */

import crypto from "node:crypto"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/db/prisma.js"
import { dispatchStatusChange, onOrderPlaced } from "../src/notifications/dispatch.js"
import { verifyWhatsAppSignature } from "../src/modules/webhooks/whatsapp.controller.js"
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
let productA: string
let customer: AuthedCaller
let nearAddress: string

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow({ orderBy: { displayOrder: "asc" } })).id
  owner = await signupApprovedOwner(app, "Notify Owner")
  await api()
    .post("/v1/stores/me")
    .set("Cookie", owner.cookieHeader)
    .send({
      name: "Notify Store",
      phone: "+919993000001",
      latitude: STORE_LAT,
      longitude: STORE_LNG,
      addressLine: "addr",
      city: "Bengaluru",
      pincode: "560102",
    })
  await api().patch("/v1/stores/me/open").set("Cookie", owner.cookieHeader).send({ isOpen: true })
  const subId = await ensureSubcategoryForOwner(owner, categoryId)
  const p = await api()
    .post("/v1/stores/me/products")
    .set("Cookie", owner.cookieHeader)
    .send({ subcategoryId: subId, name: "Notify Item", pricePaise: 10000, unit: "PIECE" })
  productA = p.body.data.product.id
  customer = await signupCustomer(app, "Notify Customer")
  const a = await api()
    .post("/v1/addresses")
    .set("Cookie", customer.cookieHeader)
    .send({ label: "Home", line1: "1 St", city: "Bengaluru", pincode: "560102", latitude: STORE_LAT, longitude: STORE_LNG })
  nearAddress = a.body.data.address.id
})

afterAll(async () => {
  await prisma.whatsAppMessageLog.deleteMany({ where: { toPhone: owner.user.phone } })
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

describe("notification dispatch routing", () => {
  it("order.placed → owner gets a new_order_owner WhatsApp (to the owner's phone)", async () => {
    const orderId = await freshOrder()
    await onOrderPlaced(orderId)
    const log = await prisma.whatsAppMessageLog.findFirst({
      where: { toPhone: owner.user.phone, templateName: "new_order_owner" },
      orderBy: { createdAt: "desc" },
    })
    expect(log).not.toBeNull()
  })

  it("customer cancel → owner gets an order_cancelled_owner WhatsApp", async () => {
    const orderId = await freshOrder()
    await dispatchStatusChange(orderId, "CANCELLED", "CUSTOMER")
    const log = await prisma.whatsAppMessageLog.findFirst({
      where: { toPhone: owner.user.phone, templateName: "order_cancelled_owner" },
      orderBy: { createdAt: "desc" },
    })
    expect(log).not.toBeNull()
  })

  it("owner-driven status (ACCEPTED) → customer-only (no WhatsApp)", async () => {
    const orderId = await freshOrder()
    const before = await prisma.whatsAppMessageLog.count({ where: { toPhone: owner.user.phone } })
    await dispatchStatusChange(orderId, "ACCEPTED", "OWNER")
    const after = await prisma.whatsAppMessageLog.count({ where: { toPhone: owner.user.phone } })
    expect(after).toBe(before) // ACCEPTED notifies the customer via push only
  })
})

describe("push subscriptions", () => {
  const endpoint = `https://push.example.com/${randomUUID()}`

  it("subscribe persists, then unsubscribe removes it", async () => {
    const sub = { endpoint, keys: { p256dh: "p".repeat(80), auth: "a".repeat(22) } }
    const res = await api().post("/v1/push/subscribe").set("Cookie", customer.cookieHeader).send(sub)
    expect(res.status).toBe(204)
    const row = await prisma.pushSubscription.findUnique({ where: { endpoint } })
    expect(row?.userId).toBe(customer.user.id)

    const del = await api()
      .delete("/v1/push/subscribe")
      .set("Cookie", customer.cookieHeader)
      .send({ endpoint })
    expect(del.status).toBe(204)
    expect(await prisma.pushSubscription.findUnique({ where: { endpoint } })).toBeNull()
  })

  it("rejects an unauthenticated subscribe", async () => {
    const res = await api()
      .post("/v1/push/subscribe")
      .send({ endpoint: "https://x.example/y", keys: { p256dh: "p", auth: "a" } })
    expect(res.status).toBe(401)
  })
})

describe("whatsapp webhook signature", () => {
  const secret = "test-app-secret"
  const raw = Buffer.from(JSON.stringify({ object: "whatsapp_business_account" }))
  const good = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`

  it("accepts a correct signature", () => {
    expect(verifyWhatsAppSignature(raw, good, secret)).toBe(true)
  })
  it("rejects a wrong signature", () => {
    const wrong = `sha256=${crypto.createHmac("sha256", "other").update(raw).digest("hex")}`
    expect(verifyWhatsAppSignature(raw, wrong, secret)).toBe(false)
  })
  it("rejects when the secret is missing (fail closed)", () => {
    expect(verifyWhatsAppSignature(raw, good, undefined)).toBe(false)
  })
  it("rejects a malformed header", () => {
    expect(verifyWhatsAppSignature(raw, "not-sha256", secret)).toBe(false)
    expect(verifyWhatsAppSignature(raw, undefined, secret)).toBe(false)
  })
})

describe("whatsapp webhook endpoints", () => {
  it("GET verify → 403 when the verify token doesn't match", async () => {
    const res = await api()
      .get("/v1/webhooks/whatsapp")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "1234" })
    expect(res.status).toBe(403)
  })

  it("POST → 403 without a valid signature", async () => {
    const res = await api()
      .post("/v1/webhooks/whatsapp")
      .set("Content-Type", "application/json")
      .send({ object: "whatsapp_business_account" })
    expect(res.status).toBe(403)
  })
})

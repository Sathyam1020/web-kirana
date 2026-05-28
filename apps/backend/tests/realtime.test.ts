/**
 * Phase 9 — Socket.IO real-time. Boots a live server + io, connects real
 * socket.io clients with handshake tickets, and asserts that order events reach
 * the right rooms (store room for the owner, user room for the customer), that
 * tickets are one-time + required, and that one customer never sees another's
 * order. See PHASE9.md.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import request from "supertest"
import { io as ioClient, type Socket } from "socket.io-client"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/db/prisma.js"
import { initRealtime } from "../src/realtime/index.js"
import {
  type AuthedCaller,
  cleanupRun,
  ensureSubcategoryForOwner,
  signupApprovedOwner,
  signupCustomer,
} from "./helpers/factories.js"

const app = buildApp()
const httpServer = createServer(app)
const io = initRealtime(httpServer)
const api = () => request(httpServer)

const STORE_LAT = 12.9116
const STORE_LNG = 77.6473

let port: number
let categoryId: string
let owner: AuthedCaller
let storeId: string
let productA: string
let customer: AuthedCaller
let nearAddress: string
const openSockets: Socket[] = []

beforeAll(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, resolve))
  port = (httpServer.address() as AddressInfo).port

  categoryId = (await prisma.category.findFirstOrThrow({ orderBy: { displayOrder: "asc" } })).id
  owner = await signupApprovedOwner(app, "RT Owner")
  const storeRes = await api()
    .post("/v1/stores/me")
    .set("Cookie", owner.cookieHeader)
    .send({
      name: "RT Store",
      phone: "+919992000001",
      latitude: STORE_LAT,
      longitude: STORE_LNG,
      addressLine: "addr",
      city: "Bengaluru",
      pincode: "560102",
    })
  storeId = storeRes.body.data.store.id
  await api().patch("/v1/stores/me/open").set("Cookie", owner.cookieHeader).send({ isOpen: true })
  const subId = await ensureSubcategoryForOwner(owner, categoryId)
  const p = await api()
    .post("/v1/stores/me/products")
    .set("Cookie", owner.cookieHeader)
    .send({ subcategoryId: subId, name: "RT Item", pricePaise: 10000, unit: "PIECE" })
  productA = p.body.data.product.id
  customer = await signupCustomer(app, "RT Customer")
  const a = await api()
    .post("/v1/addresses")
    .set("Cookie", customer.cookieHeader)
    .send({ label: "Home", line1: "1 St", city: "Bengaluru", pincode: "560102", latitude: STORE_LAT, longitude: STORE_LNG })
  nearAddress = a.body.data.address.id
})

afterAll(async () => {
  for (const s of openSockets) s.disconnect()
  await io.close()
  await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  await cleanupRun()
})

interface OrderEvt {
  orderId: string
  storeId: string
  customerId?: string
  toStatus?: string
}

async function ticketFor(caller: AuthedCaller): Promise<string> {
  const res = await api().post("/v1/realtime/ticket").set("Cookie", caller.cookieHeader)
  expect(res.status).toBe(200)
  return res.body.data.ticket as string
}

function rawConnect(token: string | undefined): Socket {
  const socket = ioClient(`http://localhost:${port}`, {
    auth: token === undefined ? {} : { token },
    reconnection: false,
  })
  openSockets.push(socket)
  return socket
}

function settled(socket: Socket): Promise<"connected"> {
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve("connected"))
    socket.on("connect_error", (err) => reject(err))
  })
}

async function connect(caller: AuthedCaller): Promise<Socket> {
  const socket = rawConnect(await ticketFor(caller))
  await settled(socket)
  return socket
}

function waitFor(socket: Socket, event: string, timeoutMs = 8000): Promise<OrderEvt> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs)
    socket.once(event, (payload: OrderEvt) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

function expectNoEvent(socket: Socket, event: string, withinMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (): void => {
      socket.off(event, handler)
      reject(new Error(`unexpected ${event}`))
    }
    socket.on(event, handler)
    setTimeout(() => {
      socket.off(event, handler)
      resolve()
    }, withinMs)
  })
}

async function freshOrder(as: AuthedCaller = customer): Promise<string> {
  const res = await api()
    .post("/v1/orders")
    .set("Cookie", as.cookieHeader)
    .set("Idempotency-Key", randomUUID())
    .send({ addressId: nearAddress, cart: [{ productId: productA, quantity: 1 }] })
  expect(res.status).toBe(201)
  return res.body.data.order.id as string
}

describe("handshake auth", () => {
  it("rejects a connection with no ticket", async () => {
    await expect(settled(rawConnect(undefined))).rejects.toThrow()
  })

  it("rejects an unknown ticket", async () => {
    await expect(settled(rawConnect("not-a-real-ticket"))).rejects.toThrow()
  })

  it("rejects a reused (one-time) ticket", async () => {
    const token = await ticketFor(customer)
    await settled(rawConnect(token)) // first use succeeds
    await expect(settled(rawConnect(token))).rejects.toThrow() // second is rejected
  })
})

describe("order events", () => {
  it("delivers order.placed to the store room and to the customer", async () => {
    const ownerSocket = await connect(owner)
    const customerSocket = await connect(customer)
    const ownerEvt = waitFor(ownerSocket, "order.placed")
    const custEvt = waitFor(customerSocket, "order.placed")
    const orderId = await freshOrder()
    const [o, c] = await Promise.all([ownerEvt, custEvt])
    expect(o.orderId).toBe(orderId)
    expect(o.storeId).toBe(storeId)
    expect(c.orderId).toBe(orderId)
  })

  it("delivers order.status_changed to both sides on accept", async () => {
    const ownerSocket = await connect(owner)
    const customerSocket = await connect(customer)
    const orderId = await freshOrder()
    const ownerEvt = waitFor(ownerSocket, "order.status_changed")
    const custEvt = waitFor(customerSocket, "order.status_changed")
    const res = await api()
      .post(`/v1/stores/me/orders/${orderId}/accept`)
      .set("Cookie", owner.cookieHeader)
    expect(res.status).toBe(200)
    const [o, c] = await Promise.all([ownerEvt, custEvt])
    expect(o.toStatus).toBe("ACCEPTED")
    expect(c.orderId).toBe(orderId)
  })

  it("does not leak one customer's order to another customer", async () => {
    const other = await signupCustomer(app, "RT Other")
    const otherSocket = await connect(other)
    const noEvent = expectNoEvent(otherSocket, "order.placed")
    await freshOrder() // placed by `customer`, not `other`
    await noEvent
  })
})

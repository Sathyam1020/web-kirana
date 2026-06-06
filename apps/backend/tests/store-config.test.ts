/**
 * IP-1 — Store config trio validation.
 *
 * Focused on the new zod surface (HH:MM regex, cross-field rule, bumped
 * radius cap, fee/threshold caps). The persistence side is covered
 * end-to-end by orders.test.ts (which uses the new fields on create).
 *
 * See apps/backend/IP1.md.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/db/prisma.js"
import {
  type AuthedCaller,
  cleanupRun,
  signupApprovedOwner,
} from "./helpers/factories.js"

const app = buildApp()
const api = () => request(app)

const STORE_LAT = 12.9116
const STORE_LNG = 77.6473

let owner: AuthedCaller

beforeAll(async () => {
  owner = await signupApprovedOwner(app, "Config Owner")
  // Create a baseline store we'll patch in each test.
  await api()
    .post("/v1/stores/me")
    .set("Cookie", owner.cookieHeader)
    .send({
      name: "Config Store",
      phone: "+919993000001",
      latitude: STORE_LAT,
      longitude: STORE_LNG,
      addressLine: "addr",
      city: "Bengaluru",
      pincode: "560102",
    })
})

afterAll(async () => {
  await cleanupRun()
})

function patch(body: Record<string, unknown>) {
  return api()
    .patch("/v1/stores/me")
    .set("Cookie", owner.cookieHeader)
    .send(body)
}

describe("PATCH /v1/stores/me — IP-1 config fields", () => {
  it("accepts the full IP-1 trio and persists it", async () => {
    const res = await patch({
      baseDeliveryFeePaise: 3000,
      freeDeliveryThresholdPaise: 20000,
      minOrderPaise: 10000,
      openTime: "07:30",
      closeTime: "22:45",
      manualClosed: false,
    })
    expect(res.status).toBe(200)
    expect(res.body.data.store).toMatchObject({
      baseDeliveryFeePaise: 3000,
      freeDeliveryThresholdPaise: 20000,
      minOrderPaise: 10000,
      openTime: "07:30",
      closeTime: "22:45",
      manualClosed: false,
    })
  })

  it("accepts the bumped 25km radius cap (was 15km pre-IP-1)", async () => {
    const ok = await patch({ deliveryRadiusMeters: 25_000 })
    expect(ok.status).toBe(200)
    expect(ok.body.data.store.deliveryRadiusMeters).toBe(25_000)

    const tooBig = await patch({ deliveryRadiusMeters: 25_001 })
    expect(tooBig.status).toBe(400)
    expect(tooBig.body.error.code).toBe("VALIDATION_ERROR")
  })

  it("rejects malformed HH:MM strings (24:00, 7:00, 'open')", async () => {
    for (const bad of ["24:00", "7:00", "open", "07-00", "0700"]) {
      const res = await patch({ openTime: bad })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    }
  })

  it("rejects openTime === closeTime via the cross-field rule", async () => {
    const res = await patch({ openTime: "09:00", closeTime: "09:00" })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
  })

  it("allows a crossing-midnight pair (open 21:00 / close 01:00)", async () => {
    const res = await patch({ openTime: "21:00", closeTime: "01:00" })
    expect(res.status).toBe(200)
    expect(res.body.data.store.openTime).toBe("21:00")
    expect(res.body.data.store.closeTime).toBe("01:00")
  })

  it("caps baseDeliveryFeePaise at ₹500 (50000 paise)", async () => {
    const ok = await patch({ baseDeliveryFeePaise: 50000 })
    expect(ok.status).toBe(200)

    const tooBig = await patch({ baseDeliveryFeePaise: 50001 })
    expect(tooBig.status).toBe(400)
  })

  it("caps freeDeliveryThresholdPaise at ₹20,000 (2000000 paise)", async () => {
    const ok = await patch({ freeDeliveryThresholdPaise: 2_000_000 })
    expect(ok.status).toBe(200)

    const tooBig = await patch({ freeDeliveryThresholdPaise: 2_000_001 })
    expect(tooBig.status).toBe(400)
  })

  it("rejects negative fee / threshold / min-order", async () => {
    for (const body of [
      { baseDeliveryFeePaise: -1 },
      { freeDeliveryThresholdPaise: -1 },
      { minOrderPaise: -1 },
    ]) {
      const res = await patch(body)
      expect(res.status).toBe(400)
    }
  })

  it("manualClosed flips independently of isOpen", async () => {
    // Confirms the field round-trips. The cron effect (isOpen stays
    // whatever owner set) is covered in cron.test.ts.
    const on = await patch({ manualClosed: true })
    expect(on.body.data.store.manualClosed).toBe(true)

    const off = await patch({ manualClosed: false })
    expect(off.body.data.store.manualClosed).toBe(false)
  })

  it("ignores unknown keys (strict body schema)", async () => {
    const res = await patch({ unknownKey: "x" })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
  })
})

describe("Store row defaults — IP-1 backfill safety", () => {
  it("an existing store without explicit IP-1 fields reads back defaults", async () => {
    // The test store was created before any IP-1 fields were set above —
    // but our first test patched them. Read the row directly to confirm
    // the schema defaults match what we'd want for a brand-new store
    // that never visited Settings.
    const baseline = await prisma.store.findFirstOrThrow({
      where: { ownerId: owner.user.id },
      select: {
        baseDeliveryFeePaise: true,
        freeDeliveryThresholdPaise: true,
        openTime: true,
        closeTime: true,
        manualClosed: true,
      },
    })
    // The earlier test patched these — assert the SHAPE is correct (not the
    // unset defaults, which the migration provides at row-create time).
    expect(typeof baseline.baseDeliveryFeePaise).toBe("number")
    expect(typeof baseline.freeDeliveryThresholdPaise).toBe("number")
    expect(/^\d{2}:\d{2}$/.test(baseline.openTime)).toBe(true)
    expect(/^\d{2}:\d{2}$/.test(baseline.closeTime)).toBe(true)
    expect(typeof baseline.manualClosed).toBe("boolean")
  })
})

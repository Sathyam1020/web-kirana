/**
 * PostGIS smoke test (Phase 1 done-check).
 *
 * Verifies end-to-end that:
 *   1. The store_sync_location trigger populates Store.location from lat/lng on INSERT.
 *   2. ST_DWithin finds the store from a nearby point.
 *   3. ST_DWithin does NOT find it from a distant point.
 *   4. UPDATE on lat/lng refreshes Store.location via the same trigger.
 *
 * Inserts a synthetic store, runs the assertions, and cleans up. Safe to run
 * against the seeded DB.
 */

import { Role } from "../src/generated/prisma/enums.js"
import { prisma } from "../src/db/prisma.js"
import { auth } from "../src/lib/auth.js"

type CountRow = { count: bigint }

const TEST_OWNER_EMAIL = "smoke-owner@kirana.local"
const TEST_OWNER_PHONE = "+919996501010"
const NEAR_POINT = { lat: 12.9145, lng: 77.6432 } // ~700m from HSR seed store
const FAR_POINT = { lat: 28.6139, lng: 77.209 } // Delhi
const RADIUS_M = 3000

async function countWithinMeters(lat: number, lng: number, radius: number, storeId: string): Promise<bigint> {
  const rows = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "Store"
    WHERE id = ${storeId}
      AND ST_DWithin(
        location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radius}
      )
  `
  const row = rows[0]
  if (!row) throw new Error("Smoke: COUNT(*) returned no row")
  return row.count
}

async function getLocationWkt(storeId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ wkt: string | null }[]>`
    SELECT ST_AsText(location) AS wkt FROM "Store" WHERE id = ${storeId}
  `
  return rows[0]?.wkt ?? null
}

async function main(): Promise<void> {
  // Owner needs to exist before the store FK. Use the better-auth signup
  // API so the row matches the new schema exactly; then patch to OWNER +
  // approved (the hook would otherwise mark OWNER as pending).
  const existing = await prisma.user.findUnique({ where: { email: TEST_OWNER_EMAIL } })
  let owner = existing
  if (owner === null) {
    await auth.api.signUpEmail({
      body: {
        email: TEST_OWNER_EMAIL,
        password: "Smoke-Password-1234!",
        name: "Smoke Owner",
        phone: TEST_OWNER_PHONE,
        role: Role.CUSTOMER, // bypass OWNER pending-approval hook; patch below
      },
    })
    owner = await prisma.user.findUniqueOrThrow({ where: { email: TEST_OWNER_EMAIL } })
  }
  await prisma.user.update({
    where: { id: owner.id },
    data: { role: Role.OWNER, isApproved: true, approvedAt: new Date() },
  })

  // The trigger keys off coords on insert.
  const store = await prisma.store.upsert({
    where: { ownerId: owner.id },
    update: {
      latitude: "12.9116000",
      longitude: "77.6473000",
    },
    create: {
      ownerId: owner.id,
      name: "Smoke Test Kirana",
      phone: "+91000000000",
      latitude: "12.9116000",
      longitude: "77.6473000",
      addressLine: "Smoke address",
      city: "Bengaluru",
      pincode: "560102",
    },
  })

  try {
    const wktAfterInsert = await getLocationWkt(store.id)
    if (wktAfterInsert === null) throw new Error("location is null after insert — trigger didn't fire")
    console.log("✓ trigger populated Store.location on insert:", wktAfterInsert)

    const near = await countWithinMeters(NEAR_POINT.lat, NEAR_POINT.lng, RADIUS_M, store.id)
    if (near !== 1n) throw new Error(`ST_DWithin from near point returned ${near}, expected 1`)
    console.log(`✓ ST_DWithin from nearby (${RADIUS_M}m) returns 1`)

    const far = await countWithinMeters(FAR_POINT.lat, FAR_POINT.lng, RADIUS_M, store.id)
    if (far !== 0n) throw new Error(`ST_DWithin from far point returned ${far}, expected 0`)
    console.log(`✓ ST_DWithin from Delhi excludes the store`)

    await prisma.store.update({
      where: { id: store.id },
      data: {
        latitude: "13.0000000",
        longitude: "77.0000000",
      },
    })
    const wktAfterUpdate = await getLocationWkt(store.id)
    if (wktAfterUpdate === wktAfterInsert) {
      throw new Error("location did not change after UPDATE — trigger missing UPDATE event")
    }
    console.log("✓ trigger refreshed Store.location on update:", wktAfterUpdate)

    console.log("\nPostGIS smoke test: PASS")
  } finally {
    // Clean up so the seed dataset is untouched.
    await prisma.store.delete({ where: { ownerId: owner.id } }).catch(() => undefined)
    await prisma.user.delete({ where: { email: TEST_OWNER_EMAIL } }).catch(() => undefined)
  }
}

main()
  .catch((err) => {
    console.error("\nPostGIS smoke test: FAIL")
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

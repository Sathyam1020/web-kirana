/**
 * Phase 5 integration tests — public discovery surface.
 *
 * Endpoints under test:
 *   GET /v1/stores/nearby           (PostGIS ST_DWithin + ST_Distance)
 *   GET /v1/stores/:id              (store detail + featured + categories)
 *   GET /v1/stores/:id/products     (paginated; delegates to search on q=)
 *
 * Tests hit the real Neon DB. Per-run phone prefix scopes test users so the
 * seed dataset is untouched; cleanupRun() in afterAll drops everything this
 * run created via cascade off User.
 *
 * Important behavioural contract validated here:
 *  - `GET /v1/stores/me` MUST still route to the owner-side router. The
 *    public router's /:id handler explicitly next()'s when id === "me".
 *  - Inactive stores never appear in any public endpoint (404), even with
 *    includeClosed=true (which only flips the isOpen filter, not isActive).
 *  - Closed stores ARE visible in /:id detail (so a customer can see "closed
 *    — opens at 9am"); they're excluded from /nearby by default.
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

afterAll(async () => {
  await cleanupRun()
  await prisma.$disconnect()
})

// Two coordinates near Bengaluru airport (KIAL), ~30km from any seeded
// store — so a 5km radius around POINT_NEAR_A captures ONLY our test
// stores. This isolation matters for pagination + distance-ordering
// assertions that would otherwise see seeded rows leak in (the seed
// places stores at exactly 12.9116,77.6473 and 12.9352,77.6245).
const COORDS_A = { lat: 13.1986, lng: 77.7066 } // KIAL-area test "near"
const COORDS_B = { lat: 13.2200, lng: 77.7200 } // ~3km from A
const POINT_NEAR_A = { lat: 13.199, lng: 77.707 } // ~70m from store A
const POINT_DELHI = { lat: 28.6139, lng: 77.209 } // ~1700km away

// Distinct phone numbers per store so cross-owner suites don't collide on
// the unique store.phone-via-owner case (phone is only unique on User; store
// phones can repeat in theory — kept distinct here for clarity).
const STORE_A = {
  name: "Discovery Store A",
  phone: "+918888000001",
  latitude: COORDS_A.lat,
  longitude: COORDS_A.lng,
  deliveryRadiusMeters: 3000,
  minOrderPaise: 9900,
  addressLine: "addr A",
  city: "Bengaluru",
  pincode: "560102",
}
const STORE_B = {
  name: "Discovery Store B",
  phone: "+918888000002",
  latitude: COORDS_B.lat,
  longitude: COORDS_B.lng,
  deliveryRadiusMeters: 2500,
  minOrderPaise: 4900,
  addressLine: "addr B",
  city: "Bengaluru",
  pincode: "560034",
}

// Resolved at boot from seed.
let seededCategoryId: string

beforeAll(async () => {
  const cats = await prisma.category.findMany({ take: 1, orderBy: { displayOrder: "asc" } })
  if (cats[0] === undefined) {
    throw new Error("Seed missing categories — run `npm run db:seed --workspace=@workspace/backend`")
  }
  seededCategoryId = cats[0].id
})

// --- Helpers -----------------------------------------------------------

interface OwnedStore {
  owner: AuthedCaller
  storeId: string
}

async function createStore(body: typeof STORE_A, isOpen = true): Promise<OwnedStore> {
  const owner = await signupApprovedOwner(app)
  const res = await api()
    .post("/v1/stores/me")
    .set("Authorization", owner.bearer)
    .send(body)
  if (res.status !== 201) {
    throw new Error(`store create failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  const storeId = res.body.data.store.id as string
  if (isOpen) {
    await api()
      .patch("/v1/stores/me/open")
      .set("Authorization", owner.bearer)
      .send({ isOpen: true })
  }
  return { owner, storeId }
}

async function addProduct(
  owner: AuthedCaller,
  overrides: Partial<{
    name: string
    pricePaise: number
    unit: string
    categoryId: string
    isAvailable: boolean
  }> = {},
): Promise<string> {
  const body = {
    name: overrides.name ?? "Aashirvaad Atta 5kg",
    pricePaise: overrides.pricePaise ?? 32500,
    unit: overrides.unit ?? "KG",
    categoryId: overrides.categoryId ?? seededCategoryId,
    isAvailable: overrides.isAvailable ?? true,
  }
  const res = await api()
    .post("/v1/stores/me/products")
    .set("Authorization", owner.bearer)
    .send(body)
  if (res.status !== 201) {
    throw new Error(`product create failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return res.body.data.product.id as string
}

// --- /v1/stores/nearby -------------------------------------------------

describe("GET /v1/stores/nearby", () => {
  it("anonymous: returns nearby open stores with positive integer distanceMeters", async () => {
    const { storeId } = await createStore(STORE_A)
    const res = await api().get(
      `/v1/stores/nearby?lat=${POINT_NEAR_A.lat}&lng=${POINT_NEAR_A.lng}&radiusMeters=5000`,
    )
    expect(res.status).toBe(200)
    const ids = (res.body.data.items as { id: string; distanceMeters: number }[]).map((s) => s.id)
    expect(ids).toContain(storeId)
    const me = (res.body.data.items as { id: string; distanceMeters: number }[]).find((s) => s.id === storeId)
    expect(me).toBeDefined()
    expect(Number.isInteger(me!.distanceMeters)).toBe(true)
    expect(me!.distanceMeters).toBeGreaterThanOrEqual(0)
    expect(me!.distanceMeters).toBeLessThan(5000)
  })

  it("returns empty when the query point is 1700km away", async () => {
    await createStore(STORE_A)
    const res = await api().get(
      `/v1/stores/nearby?lat=${POINT_DELHI.lat}&lng=${POINT_DELHI.lng}&radiusMeters=5000`,
    )
    expect(res.status).toBe(200)
    expect(res.body.data.items).toEqual([])
    expect(res.body.data.hasMore).toBe(false)
  })

  it("400 when lat is missing", async () => {
    const res = await api().get(`/v1/stores/nearby?lng=${POINT_NEAR_A.lng}`)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")
  })

  it("400 when radiusMeters > 50_000", async () => {
    const res = await api().get(
      `/v1/stores/nearby?lat=${POINT_NEAR_A.lat}&lng=${POINT_NEAR_A.lng}&radiusMeters=60000`,
    )
    expect(res.status).toBe(400)
  })

  it("closed store excluded by default; includeClosed=true includes it", async () => {
    const { storeId, owner } = await createStore(STORE_A)
    await api()
      .patch("/v1/stores/me/open")
      .set("Authorization", owner.bearer)
      .send({ isOpen: false })

    const withoutFlag = await api().get(
      `/v1/stores/nearby?lat=${POINT_NEAR_A.lat}&lng=${POINT_NEAR_A.lng}&radiusMeters=5000`,
    )
    expect(withoutFlag.status).toBe(200)
    expect((withoutFlag.body.data.items as { id: string }[]).find((s) => s.id === storeId)).toBeUndefined()

    const withFlag = await api().get(
      `/v1/stores/nearby?lat=${POINT_NEAR_A.lat}&lng=${POINT_NEAR_A.lng}&radiusMeters=5000&includeClosed=true`,
    )
    expect(withFlag.status).toBe(200)
    const matched = (withFlag.body.data.items as { id: string; isOpen: boolean }[]).find((s) => s.id === storeId)
    expect(matched).toBeDefined()
    expect(matched!.isOpen).toBe(false)
  })

  it("inactive store is NEVER returned, even with includeClosed=true", async () => {
    const { storeId } = await createStore(STORE_A)
    await prisma.store.update({ where: { id: storeId }, data: { isActive: false } })
    const res = await api().get(
      `/v1/stores/nearby?lat=${POINT_NEAR_A.lat}&lng=${POINT_NEAR_A.lng}&radiusMeters=5000&includeClosed=true`,
    )
    expect(res.status).toBe(200)
    expect((res.body.data.items as { id: string }[]).find((s) => s.id === storeId)).toBeUndefined()
  })

  it("orders by distance ASC across two stores", async () => {
    // Isolated coords (Cochin area) so no other test stores or seed stores
    // sit in this radius. Otherwise the cuid tiebreak at equal distance
    // makes the assertion brittle as the test file grows.
    const near = await createStore({ ...STORE_A, latitude: 10.0, longitude: 75.0 })
    const far = await createStore({ ...STORE_B, latitude: 10.03, longitude: 75.0 })
    const res = await api().get(`/v1/stores/nearby?lat=10.0&lng=75.0&radiusMeters=10000`)
    expect(res.status).toBe(200)
    const items = res.body.data.items as { id: string; distanceMeters: number }[]
    expect(items.map((s) => s.id)).toEqual([near.storeId, far.storeId])
    expect(items[0]!.distanceMeters).toBeLessThan(items[1]!.distanceMeters)
  })

  it("page=2&limit=1 returns the farther store with hasMore=false", async () => {
    // Isolated coords (Chennai area) — no overlap with COORDS_A/B nor seed.
    const near = await createStore({ ...STORE_A, latitude: 13.082, longitude: 80.27 })
    const far = await createStore({ ...STORE_B, latitude: 13.105, longitude: 80.27 })
    const p1 = await api().get(`/v1/stores/nearby?lat=13.082&lng=80.27&radiusMeters=10000&limit=1&page=1`)
    expect(p1.status).toBe(200)
    expect(p1.body.data.items).toHaveLength(1)
    expect((p1.body.data.items as { id: string }[])[0]!.id).toBe(near.storeId)
    expect(p1.body.data.hasMore).toBe(true)

    const p2 = await api().get(`/v1/stores/nearby?lat=13.082&lng=80.27&radiusMeters=10000&limit=1&page=2`)
    expect(p2.status).toBe(200)
    expect((p2.body.data.items as { id: string }[]).map((s) => s.id)).toContain(far.storeId)
    expect(p2.body.data.hasMore).toBe(false)
  })

  it("does NOT leak ownerId / isActive / updatedAt in the public view", async () => {
    await createStore(STORE_A)
    const res = await api().get(
      `/v1/stores/nearby?lat=${POINT_NEAR_A.lat}&lng=${POINT_NEAR_A.lng}&radiusMeters=5000`,
    )
    expect(res.status).toBe(200)
    const first = (res.body.data.items as Record<string, unknown>[])[0]
    expect(first).toBeDefined()
    expect(first).not.toHaveProperty("ownerId")
    expect(first).not.toHaveProperty("isActive")
    expect(first).not.toHaveProperty("updatedAt")
  })
})

// --- /v1/stores/:id ----------------------------------------------------

describe("GET /v1/stores/:id", () => {
  it("anonymous: 200 with store + featuredProducts + categories", async () => {
    const { owner, storeId } = await createStore(STORE_A)
    const productId = await addProduct(owner, { name: "Featured Atta" })
    // Pin it as featured via the owner endpoint so we exercise the real path.
    await api()
      .post(`/v1/stores/me/products/${productId}/feature`)
      .set("Authorization", owner.bearer)
      .send({ featuredOrder: 0 })

    const res = await api().get(`/v1/stores/${storeId}`)
    expect(res.status).toBe(200)
    expect(res.body.data.store.id).toBe(storeId)
    expect(res.body.data.store.name).toBe(STORE_A.name)
    expect(Array.isArray(res.body.data.featuredProducts)).toBe(true)
    const featuredIds = (res.body.data.featuredProducts as { id: string; isFeatured: boolean }[]).map((p) => p.id)
    expect(featuredIds).toContain(productId)
    expect(Array.isArray(res.body.data.categories)).toBe(true)
    const cats = res.body.data.categories as { id: string; name: string; productCount: number }[]
    expect(cats.length).toBeGreaterThanOrEqual(1)
    expect(cats[0]!.productCount).toBeGreaterThanOrEqual(1)
  })

  it("featuredProducts honor featuredOrder ASC (NULLS LAST), then createdAt DESC", async () => {
    const { owner, storeId } = await createStore(STORE_A)
    const a = await addProduct(owner, { name: "Featured A" })
    const b = await addProduct(owner, { name: "Featured B" })
    const c = await addProduct(owner, { name: "Featured C" })
    // Pin all three with different orders: c=0, a=5, b=10
    await api().post(`/v1/stores/me/products/${c}/feature`).set("Authorization", owner.bearer).send({ featuredOrder: 0 })
    await api().post(`/v1/stores/me/products/${a}/feature`).set("Authorization", owner.bearer).send({ featuredOrder: 5 })
    await api().post(`/v1/stores/me/products/${b}/feature`).set("Authorization", owner.bearer).send({ featuredOrder: 10 })

    const res = await api().get(`/v1/stores/${storeId}`)
    expect(res.status).toBe(200)
    const ids = (res.body.data.featuredProducts as { id: string }[]).map((p) => p.id)
    // Filter to the three we created — there may be earlier featured items
    // from other tests in this file (cleanupRun handles all of them).
    const subset = ids.filter((id) => id === a || id === b || id === c)
    expect(subset).toEqual([c, a, b])
  })

  it("404 for inactive store", async () => {
    const { storeId } = await createStore(STORE_A)
    await prisma.store.update({ where: { id: storeId }, data: { isActive: false } })
    const res = await api().get(`/v1/stores/${storeId}`)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("NOT_FOUND")
  })

  it("closed store IS visible (isOpen=false), so client can render 'closed' badge", async () => {
    const { storeId, owner } = await createStore(STORE_A)
    await api()
      .patch("/v1/stores/me/open")
      .set("Authorization", owner.bearer)
      .send({ isOpen: false })
    const res = await api().get(`/v1/stores/${storeId}`)
    expect(res.status).toBe(200)
    expect(res.body.data.store.isOpen).toBe(false)
  })

  it("404 for non-existent store id", async () => {
    const res = await api().get(`/v1/stores/does-not-exist-zzzz`)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("NOT_FOUND")
  })

  it("/v1/stores/me with valid OWNER auth still routes to owner endpoint (fall-through preserved)", async () => {
    const { owner } = await createStore(STORE_A)
    const res = await api().get("/v1/stores/me").set("Authorization", owner.bearer)
    expect(res.status).toBe(200)
    // Owner endpoint returns { store: ... } with ownerId — public would not.
    expect(res.body.data.store.ownerId).toBe(owner.user.id)
  })

  it("/v1/stores/me anonymous → 401 (owner router rejects after fall-through)", async () => {
    const res = await api().get("/v1/stores/me")
    expect(res.status).toBe(401)
  })

  it("/v1/stores/me with CUSTOMER auth → 403 (owner router enforces role)", async () => {
    const customer = await signupCustomer(app)
    const res = await api().get("/v1/stores/me").set("Authorization", customer.bearer)
    expect(res.status).toBe(403)
  })

  it("does NOT leak ownerId on the public view", async () => {
    const { storeId } = await createStore(STORE_A)
    const res = await api().get(`/v1/stores/${storeId}`)
    expect(res.status).toBe(200)
    expect(res.body.data.store).not.toHaveProperty("ownerId")
    expect(res.body.data.store).not.toHaveProperty("isActive")
    expect(res.body.data.store).not.toHaveProperty("updatedAt")
  })

  it("featuredProducts excludes unavailable items even when isFeatured=true", async () => {
    const { owner, storeId } = await createStore(STORE_A)
    const featuredId = await addProduct(owner, { name: "Pinned but OOS" })
    await api()
      .post(`/v1/stores/me/products/${featuredId}/feature`)
      .set("Authorization", owner.bearer)
      .send({ featuredOrder: 0 })
    await api()
      .patch(`/v1/stores/me/products/${featuredId}`)
      .set("Authorization", owner.bearer)
      .send({ isAvailable: false })

    const res = await api().get(`/v1/stores/${storeId}`)
    expect(res.status).toBe(200)
    const ids = (res.body.data.featuredProducts as { id: string }[]).map((p) => p.id)
    expect(ids).not.toContain(featuredId)
  })
})

// --- /v1/stores/:id/products ------------------------------------------

describe("GET /v1/stores/:id/products", () => {
  it("anonymous: returns active+available products of the store", async () => {
    const { owner, storeId } = await createStore(STORE_A)
    const productId = await addProduct(owner, { name: "Listed Atta" })
    const res = await api().get(`/v1/stores/${storeId}/products`)
    expect(res.status).toBe(200)
    const ids = (res.body.data.items as { id: string }[]).map((p) => p.id)
    expect(ids).toContain(productId)
  })

  it("excludes inactive (soft-deleted) and unavailable products", async () => {
    const { owner, storeId } = await createStore(STORE_A)
    const visible = await addProduct(owner, { name: "Visible" })
    const oos = await addProduct(owner, { name: "OOS" })
    const deleted = await addProduct(owner, { name: "Deleted" })
    await api().patch(`/v1/stores/me/products/${oos}`).set("Authorization", owner.bearer).send({ isAvailable: false })
    await api().delete(`/v1/stores/me/products/${deleted}`).set("Authorization", owner.bearer)

    const res = await api().get(`/v1/stores/${storeId}/products`)
    expect(res.status).toBe(200)
    const ids = (res.body.data.items as { id: string }[]).map((p) => p.id)
    expect(ids).toContain(visible)
    expect(ids).not.toContain(oos)
    expect(ids).not.toContain(deleted)
  })

  it("category= filter narrows the result", async () => {
    const { owner, storeId } = await createStore(STORE_A)
    // Two distinct categories from seed.
    const cats = await prisma.category.findMany({ take: 2, orderBy: { displayOrder: "asc" } })
    const catA = cats[0]!
    const catB = cats[1]!
    const pA = await addProduct(owner, { name: "Cat A item", categoryId: catA.id })
    const pB = await addProduct(owner, { name: "Cat B item", categoryId: catB.id })

    const res = await api().get(`/v1/stores/${storeId}/products?category=${catA.id}`)
    expect(res.status).toBe(200)
    const ids = (res.body.data.items as { id: string }[]).map((p) => p.id)
    expect(ids).toContain(pA)
    expect(ids).not.toContain(pB)
  })

  it("featured products appear before unfeatured in default ordering", async () => {
    const { owner, storeId } = await createStore(STORE_A)
    // Names chosen so the alphabetical tiebreak would put unfeatured FIRST
    // — proving the (isFeatured DESC) clause is doing the work.
    const unfeatured = await addProduct(owner, { name: "AAA unfeatured" })
    const featured = await addProduct(owner, { name: "ZZZ featured" })
    await api()
      .post(`/v1/stores/me/products/${featured}/feature`)
      .set("Authorization", owner.bearer)
      .send({ featuredOrder: 0 })

    const res = await api().get(`/v1/stores/${storeId}/products`)
    expect(res.status).toBe(200)
    const ids = (res.body.data.items as { id: string }[]).map((p) => p.id)
    expect(ids.indexOf(featured)).toBeLessThan(ids.indexOf(unfeatured))
  })

  it("q= delegates to search service (store-scoped, customer filter applied)", async () => {
    const { owner, storeId } = await createStore(STORE_A)
    await addProduct(owner, { name: "Aashirvaad Atta 5kg" })
    await addProduct(owner, { name: "Tata Salt 1kg" })

    const res = await api().get(`/v1/stores/${storeId}/products?q=atta`)
    expect(res.status).toBe(200)
    const names = (res.body.data.items as { name: string; storeId: string }[]).map((p) => p.name)
    expect(names.join(" ").toLowerCase()).toContain("atta")
    // Every result must be scoped to this store.
    for (const item of res.body.data.items as { storeId: string }[]) {
      expect(item.storeId).toBe(storeId)
    }
  })

  it("q= + category= both apply", async () => {
    const { owner, storeId } = await createStore(STORE_A)
    const cats = await prisma.category.findMany({ take: 2, orderBy: { displayOrder: "asc" } })
    const catA = cats[0]!
    const catB = cats[1]!
    await addProduct(owner, { name: "Atta in catA", categoryId: catA.id })
    await addProduct(owner, { name: "Atta in catB", categoryId: catB.id })

    const res = await api().get(`/v1/stores/${storeId}/products?q=atta&category=${catA.id}`)
    expect(res.status).toBe(200)
    for (const item of res.body.data.items as { categoryId: string }[]) {
      expect(item.categoryId).toBe(catA.id)
    }
  })

  it("404 when store is inactive", async () => {
    const { storeId } = await createStore(STORE_A)
    await prisma.store.update({ where: { id: storeId }, data: { isActive: false } })
    const res = await api().get(`/v1/stores/${storeId}/products`)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("NOT_FOUND")
  })

  it("/v1/stores/me/products with OWNER auth still routes to owner endpoint", async () => {
    // Phase 4 regression: the new public /:id/products handler must next()
    // when id === "me" so the owner-side router can serve it.
    const { owner } = await createStore(STORE_A)
    await addProduct(owner, { name: "Owner-side list check" })
    const res = await api().get("/v1/stores/me/products").set("Authorization", owner.bearer)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.items)).toBe(true)
  })

  it("pagination: limit=1 returns hasMore=true when 2 products exist", async () => {
    const { owner, storeId } = await createStore(STORE_A)
    await addProduct(owner, { name: "Item 1" })
    await addProduct(owner, { name: "Item 2" })
    const res = await api().get(`/v1/stores/${storeId}/products?limit=1&page=1`)
    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.hasMore).toBe(true)
    expect(res.body.data.page).toBe(1)
  })
})

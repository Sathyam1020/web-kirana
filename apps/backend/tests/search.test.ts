/**
 * Phase 4.2 search tests — covers the customer-facing `/v1/search/products`
 * endpoint AND the owner self-search via `/v1/stores/me/products?q=...`.
 *
 * The seed dataset is the test corpus (with aliases for Hindi/Romanized
 * synonyms). Tests don't create new products beyond what they need to
 * exercise specific corner cases, so the search dataset stays realistic.
 */

import { afterAll, describe, expect, it } from "vitest"
import request from "supertest"
import { buildApp } from "../src/app.js"
import { prisma } from "../src/db/prisma.js"
import {
  cleanupRun,
  ensureSubcategoryForOwner,
  signupApprovedOwner,
} from "./helpers/factories.js"

const app = buildApp()
const api = () => request(app)

afterAll(async () => {
  await cleanupRun()
  await prisma.$disconnect()
})

async function search(q: string, extra: string = ""): Promise<request.Response> {
  return api().get(`/v1/search/products?q=${encodeURIComponent(q)}${extra}`)
}

function names(res: request.Response): string[] {
  return (res.body?.data?.items ?? []).map((it: { name: string }) => it.name)
}

describe("Customer search — basic relevance", () => {
  it("exact word in product name ranks top", async () => {
    const res = await search("atta")
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Aashirvaad Atta 5kg")
    expect(names(res)[0]).toBe("Aashirvaad Atta 5kg")
  })

  it("brand name match works (Maggi-style — using 'aashirvaad')", async () => {
    const res = await search("aashirvaad")
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Aashirvaad Atta 5kg")
  })

  it("description / category match still surfaces results", async () => {
    const res = await search("dairy")
    expect(res.status).toBe(200)
    // Category "Dairy & Eggs" hits products in it
    const got = names(res)
    expect(got).toContain("Amul Gold Milk 1L")
    expect(got).toContain("Nandini Curd 500g")
  })
})

describe("Customer search — fuzzy / typo tolerance", () => {
  it("typo: 'atta' vs 'ata' still returns Atta product", async () => {
    const res = await search("ata")
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Aashirvaad Atta 5kg")
  })

  it("typo: 'colgte' (missing letter) returns Colgate", async () => {
    const res = await search("colgte")
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Colgate Strong Teeth 200g")
  })

  it("typo: 'aaashirvad' (transposed letters) still matches Aashirvaad", async () => {
    const res = await search("aaashirvad")
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Aashirvaad Atta 5kg")
  })
})

describe("Customer search — multi-language via aliases", () => {
  it("Hindi script (Devanagari): दूध returns Amul Milk", async () => {
    const res = await search("दूध")
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Amul Gold Milk 1L")
  })

  it("Romanized Hindi: 'doodh' returns Amul Milk", async () => {
    const res = await search("doodh")
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Amul Gold Milk 1L")
  })

  it("Hindi script: चावल returns Sona Masuri Rice", async () => {
    const res = await search("चावल")
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Sona Masuri Rice 1kg")
  })

  it("Hindi: 'दही' returns Nandini Curd", async () => {
    const res = await search("दही")
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Nandini Curd 500g")
  })

  it("alternate synonym: 'yogurt' returns Nandini Curd via alias", async () => {
    const res = await search("yogurt")
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Nandini Curd 500g")
  })

  it("generic term: 'biscuit' returns Parle-G", async () => {
    const res = await search("biscuit")
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Parle-G Original 250g")
  })
})

describe("Customer search — visibility rules", () => {
  it("only returns products from active + open stores", async () => {
    // Find an existing open store and close it; verify its products vanish.
    const store = await prisma.store.findFirst({
      where: { isActive: true, isOpen: true },
      select: { id: true },
    })
    expect(store).not.toBeNull()
    await prisma.store.update({ where: { id: store!.id }, data: { isOpen: false } })

    try {
      const productsInStore = await prisma.product.findMany({
        where: { storeId: store!.id, isActive: true, isAvailable: true },
        select: { name: true },
      })
      const hidden = productsInStore.map((p) => p.name)

      // Search for something that should hit those products
      const res = await search("milk")
      const visible = names(res)
      for (const h of hidden) {
        if (h === "Amul Gold Milk 1L") {
          expect(visible).not.toContain(h)
        }
      }
    } finally {
      await prisma.store.update({ where: { id: store!.id }, data: { isOpen: true } })
    }
  })

  it("does not return products with isAvailable=false", async () => {
    const product = await prisma.product.findFirst({
      where: { name: "Lays Classic Salted 50g" },
      select: { id: true, isAvailable: true },
    })
    expect(product).not.toBeNull()
    await prisma.product.update({
      where: { id: product!.id },
      data: { isAvailable: false },
    })
    try {
      const res = await search("lays")
      expect(names(res)).not.toContain("Lays Classic Salted 50g")
    } finally {
      await prisma.product.update({
        where: { id: product!.id },
        data: { isAvailable: true },
      })
    }
  })

  it("does not return soft-deleted (isActive=false) products", async () => {
    const product = await prisma.product.findFirst({
      where: { name: "Surf Excel 1kg" },
      select: { id: true, isActive: true },
    })
    await prisma.product.update({
      where: { id: product!.id },
      data: { isActive: false },
    })
    try {
      const res = await search("surf")
      expect(names(res)).not.toContain("Surf Excel 1kg")
    } finally {
      await prisma.product.update({
        where: { id: product!.id },
        data: { isActive: true },
      })
    }
  })
})

describe("Customer search — filters", () => {
  it("scope to one categoryId", async () => {
    // Phase 6.6: Category is now unique on (departmentId, name) — find via
    // name across all depts (only one matches in seed).
    const dairy = await prisma.category.findFirstOrThrow({
      where: { name: "Dairy & Eggs" },
      select: { id: true },
    })
    const res = await search("a", `&categoryId=${dairy.id}`)
    expect(res.status).toBe(200)
    const items = res.body.data.items as { categoryName: string }[]
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((it) => it.categoryName === "Dairy & Eggs")).toBe(true)
  })

  it("scope to one storeId", async () => {
    const store = await prisma.store.findFirst({
      where: { name: "Sri Krishna Kirana" },
      select: { id: true },
    })
    const res = await search("a", `&storeId=${store!.id}`)
    expect(res.status).toBe(200)
    const items = res.body.data.items as { storeId: string }[]
    expect(items.every((it) => it.storeId === store!.id)).toBe(true)
  })

  it("400 when only 2 of (lat,lng,radiusMeters) are provided", async () => {
    const res = await search("atta", "&lat=12.9116&lng=77.6473")
    expect(res.status).toBe(400)
  })

  it("geo filter: lat/lng/radius narrows to stores within range", async () => {
    // Both seeded stores are in Bangalore. Search from far away → no results.
    const res = await search("milk", "&lat=28.6&lng=77.2&radiusMeters=5000")
    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBe(0)
  })

  it("geo filter: nearby coords return Bangalore stores", async () => {
    const res = await search("milk", "&lat=12.9145&lng=77.6432&radiusMeters=5000")
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Amul Gold Milk 1L")
  })
})

describe("Customer search — pagination", () => {
  it("respects page + limit", async () => {
    const page1 = await search("a", "&limit=2&page=1")
    expect(page1.status).toBe(200)
    expect(page1.body.data.items.length).toBeLessThanOrEqual(2)
    expect(page1.body.data.page).toBe(1)

    const page2 = await search("a", "&limit=2&page=2")
    expect(page2.status).toBe(200)
    // page2 items are disjoint from page1
    const p1 = page1.body.data.items.map((it: { id: string }) => it.id)
    const p2 = page2.body.data.items.map((it: { id: string }) => it.id)
    for (const id of p2) expect(p1).not.toContain(id)
  })
})

describe("Customer search — validation", () => {
  it("rejects empty q", async () => {
    const res = await api().get("/v1/search/products?q=")
    expect(res.status).toBe(400)
  })

  it("rejects a 200-char q (over the 100 limit)", async () => {
    const q = "a".repeat(200)
    const res = await search(q)
    expect(res.status).toBe(400)
  })

  it("rejects bad lat/lng/radius types", async () => {
    const res = await api().get("/v1/search/products?q=atta&lat=notanumber")
    expect(res.status).toBe(400)
  })

  it("404 on the search router catch-all (POST not allowed)", async () => {
    const res = await api().post("/v1/search/products").send({ q: "atta" })
    expect(res.status).toBe(404)
  })
})

describe("Owner self-search via /stores/me/products?q=", () => {
  it("owner sees their own inactive product via q=", async () => {
    const owner = await signupApprovedOwner(app, "Search Test Owner")
    await api()
      .post("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({
        name: "Search Owner Store",
        phone: "+919999777777",
        latitude: 12.9116,
        longitude: 77.6473,
        addressLine: "addr",
        city: "Bengaluru",
        pincode: "560102",
      })
    const cats = await prisma.category.findMany({ take: 1 })
    const subcategoryId = await ensureSubcategoryForOwner(owner, cats[0]!.id)
    const created = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({
        subcategoryId,
        name: "Maggi 2-Minute Noodles",
        pricePaise: 1400,
        unit: "G",
        searchAliases: ["maggi", "noodles", "मैगी"],
      })

    // Soft delete the product
    await api()
      .delete(`/v1/stores/me/products/${created.body.data.product.id}`)
      .set("Cookie", owner.cookieHeader)

    // Owner with includeInactive=true + q='maggi' should still find it.
    const res = await api()
      .get("/v1/stores/me/products?q=maggi&includeInactive=true")
      .set("Cookie", owner.cookieHeader)
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Maggi 2-Minute Noodles")
  })

  it("owner search via alias (Devanagari)", async () => {
    const owner = await signupApprovedOwner(app, "Devanagari Owner")
    await api()
      .post("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({
        name: "Devanagari Store",
        phone: "+919999888888",
        latitude: 12.9116,
        longitude: 77.6473,
        addressLine: "addr",
        city: "Bengaluru",
        pincode: "560102",
      })
    const cats = await prisma.category.findMany({ take: 1 })
    const subcategoryId = await ensureSubcategoryForOwner(owner, cats[0]!.id)
    await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({
        subcategoryId,
        name: "Bread Whole Wheat",
        pricePaise: 3500,
        unit: "PIECE",
        searchAliases: ["bread", "ब्रेड", "double roti"],
      })

    const res = await api()
      .get(`/v1/stores/me/products?q=${encodeURIComponent("ब्रेड")}`)
      .set("Cookie", owner.cookieHeader)
    expect(res.status).toBe(200)
    expect(names(res)).toContain("Bread Whole Wheat")
  })
})

describe("Validation around searchAliases on Product create/update", () => {
  it("rejects >20 aliases", async () => {
    const owner = await signupApprovedOwner(app, "Too Many Aliases")
    await api()
      .post("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({
        name: "Aliases Store",
        phone: "+919999666666",
        latitude: 12.9116,
        longitude: 77.6473,
        addressLine: "addr",
        city: "Bengaluru",
        pincode: "560102",
      })
    const cats = await prisma.category.findMany({ take: 1 })
    const subcategoryId = await ensureSubcategoryForOwner(owner, cats[0]!.id)
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({
        subcategoryId,
        name: "Test",
        pricePaise: 1000,
        unit: "PIECE",
        searchAliases: Array.from({ length: 21 }, (_, i) => `alias${i}`),
      })
    expect(res.status).toBe(400)
  })

  it("dedupes + lowercases aliases on create", async () => {
    const owner = await signupApprovedOwner(app, "Dedupe Aliases")
    await api()
      .post("/v1/stores/me")
      .set("Cookie", owner.cookieHeader)
      .send({
        name: "Dedupe Store",
        phone: "+919999555555",
        latitude: 12.9116,
        longitude: 77.6473,
        addressLine: "addr",
        city: "Bengaluru",
        pincode: "560102",
      })
    const cats = await prisma.category.findMany({ take: 1 })
    const subcategoryId = await ensureSubcategoryForOwner(owner, cats[0]!.id)
    const res = await api()
      .post("/v1/stores/me/products")
      .set("Cookie", owner.cookieHeader)
      .send({
        subcategoryId,
        name: "DedupeProduct",
        pricePaise: 1000,
        unit: "PIECE",
        searchAliases: ["FOO", "foo", "BAR", "bar"],
      })
    expect(res.status).toBe(201)
    expect(res.body.data.product.searchAliases.sort()).toEqual(["bar", "foo"])
  })
})

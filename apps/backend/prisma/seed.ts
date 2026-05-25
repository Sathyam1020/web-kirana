/**
 * Seed script — creates a small, deterministic dataset for local dev:
 *   - 4 categories (global)
 *   - 2 owners + their stores at real Bangalore coordinates
 *   - 6 products per store across the categories
 *   - 2 customers, one with a default address near the stores
 *
 * Idempotent: every upsert is keyed so re-running won't duplicate rows.
 */

import argon2 from "argon2"
import { prisma } from "../src/db/prisma.js"
import { Role, Unit } from "../src/generated/prisma/enums.js"

const SEED_PASSWORD = "Password123!"

async function hashOnce(): Promise<string> {
  return argon2.hash(SEED_PASSWORD)
}

async function main(): Promise<void> {
  const passwordHash = await hashOnce()

  // Categories — global taxonomy, displayed in store detail grouped views.
  const categoriesSpec = [
    { name: "Atta, Rice & Dal", displayOrder: 10 },
    { name: "Dairy & Eggs", displayOrder: 20 },
    { name: "Snacks & Beverages", displayOrder: 30 },
    { name: "Personal Care", displayOrder: 40 },
  ]
  const categories = await Promise.all(
    categoriesSpec.map((c) =>
      prisma.category.upsert({
        where: { name: c.name },
        update: { displayOrder: c.displayOrder },
        create: c,
      }),
    ),
  )
  const catByName = new Map(categories.map((c) => [c.name, c]))
  const cat = (name: string): string => {
    const found = catByName.get(name)
    if (!found) throw new Error(`Seed bug: category not found: ${name}`)
    return found.id
  }

  // Admin — bootstrap account. No public signup for ADMIN; this is the only
  // way an admin row exists in the DB.
  await prisma.user.upsert({
    where: { phone: "+919900000000" },
    update: {},
    create: {
      phone: "+919900000000",
      passwordHash,
      role: Role.ADMIN,
      name: "Marketplace Admin",
      isApproved: true,
    },
  })

  // Owners + stores.
  const ownerA = await prisma.user.upsert({
    where: { phone: "+919900000001" },
    update: {},
    create: {
      phone: "+919900000001",
      passwordHash,
      role: Role.OWNER,
      name: "Ramesh Kumar",
    },
  })
  const ownerB = await prisma.user.upsert({
    where: { phone: "+919900000002" },
    update: {},
    create: {
      phone: "+919900000002",
      passwordHash,
      role: Role.OWNER,
      name: "Suman Reddy",
    },
  })

  const storeA = await prisma.store.upsert({
    where: { ownerId: ownerA.id },
    update: {},
    create: {
      ownerId: ownerA.id,
      name: "Sri Krishna Kirana",
      description: "Family-run grocery in HSR Layout since 1998.",
      phone: "+918025550001",
      isActive: true,
      isOpen: true,
      latitude: 12.9116,
      longitude: 77.6473,
      deliveryRadiusMeters: 3000,
      minOrderPaise: 9900,
      addressLine: "23, 27th Main, HSR Layout Sector 2",
      city: "Bengaluru",
      pincode: "560102",
    },
  })

  const storeB = await prisma.store.upsert({
    where: { ownerId: ownerB.id },
    update: {},
    create: {
      ownerId: ownerB.id,
      name: "Reddy Provisions",
      description: "Daily essentials at fair prices in Koramangala.",
      phone: "+918025550002",
      isActive: true,
      isOpen: true,
      latitude: 12.9352,
      longitude: 77.6245,
      deliveryRadiusMeters: 2500,
      minOrderPaise: 4900,
      addressLine: "5, 80 Feet Road, Koramangala 4 Block",
      city: "Bengaluru",
      pincode: "560034",
    },
  })

  // Products per store. Using deterministic SKU-like keys for idempotent upserts:
  // (storeId, name) is not unique in the schema, so we identify by id-via-find.
  const productSpec: Array<{
    store: typeof storeA
    name: string
    category: string
    pricePaise: number
    unit: Unit
    aliases?: string[]
  }> = [
    { store: storeA, name: "Aashirvaad Atta 5kg", category: "Atta, Rice & Dal", pricePaise: 32500, unit: Unit.KG,
      aliases: ["atta", "wheat flour", "gehu ka atta", "गेहूँ का आटा"] },
    { store: storeA, name: "Sona Masuri Rice 1kg", category: "Atta, Rice & Dal", pricePaise: 8500, unit: Unit.KG,
      aliases: ["rice", "chawal", "चावल"] },
    { store: storeA, name: "Amul Gold Milk 1L", category: "Dairy & Eggs", pricePaise: 7200, unit: Unit.L,
      aliases: ["milk", "doodh", "दूध", "amul"] },
    { store: storeA, name: "Lays Classic Salted 50g", category: "Snacks & Beverages", pricePaise: 2000, unit: Unit.G,
      aliases: ["chips", "lays", "potato chips"] },
    { store: storeA, name: "Bingo Mad Angles 100g", category: "Snacks & Beverages", pricePaise: 3000, unit: Unit.G,
      aliases: ["chips", "bingo"] },
    { store: storeA, name: "Colgate Strong Teeth 200g", category: "Personal Care", pricePaise: 11500, unit: Unit.G,
      aliases: ["toothpaste", "manjan", "मंजन"] },
    { store: storeB, name: "Toor Dal 1kg", category: "Atta, Rice & Dal", pricePaise: 14500, unit: Unit.KG,
      aliases: ["dal", "toor", "arhar", "तूअर दाल"] },
    { store: storeB, name: "Nandini Curd 500g", category: "Dairy & Eggs", pricePaise: 4500, unit: Unit.G,
      aliases: ["curd", "dahi", "yogurt", "दही"] },
    { store: storeB, name: "Coca Cola 750ml", category: "Snacks & Beverages", pricePaise: 4000, unit: Unit.ML,
      aliases: ["cola", "soft drink", "coke"] },
    { store: storeB, name: "Parle-G Original 250g", category: "Snacks & Beverages", pricePaise: 2500, unit: Unit.G,
      aliases: ["biscuit", "parle", "parle g"] },
    { store: storeB, name: "Dove Soap 100g", category: "Personal Care", pricePaise: 7500, unit: Unit.G,
      aliases: ["soap", "sabun", "साबुन"] },
    { store: storeB, name: "Surf Excel 1kg", category: "Personal Care", pricePaise: 25000, unit: Unit.KG,
      aliases: ["detergent", "washing powder", "surf"] },
  ]
  for (const p of productSpec) {
    const existing = await prisma.product.findFirst({
      where: { storeId: p.store.id, name: p.name },
    })
    if (existing) {
      // Backfill aliases on existing rows so re-seeding upgrades the search dataset.
      if (p.aliases !== undefined) {
        await prisma.product.update({
          where: { id: existing.id },
          data: { searchAliases: p.aliases.map((a) => a.toLowerCase()) },
        })
      }
      continue
    }
    await prisma.product.create({
      data: {
        storeId: p.store.id,
        categoryId: cat(p.category),
        name: p.name,
        pricePaise: p.pricePaise,
        unit: p.unit,
        isActive: true,
        isAvailable: true,
        searchAliases: (p.aliases ?? []).map((a) => a.toLowerCase()),
      },
    })
  }

  // Customers.
  const customer = await prisma.user.upsert({
    where: { phone: "+919900000010" },
    update: {},
    create: {
      phone: "+919900000010",
      passwordHash,
      role: Role.CUSTOMER,
      name: "Anita Sharma",
    },
  })

  const existingAddr = await prisma.address.findFirst({
    where: { customerId: customer.id, label: "Home" },
  })
  if (!existingAddr) {
    await prisma.address.create({
      data: {
        customerId: customer.id,
        label: "Home",
        line1: "Flat 4B, Brigade Meadows",
        line2: "Near HSR Club",
        city: "Bengaluru",
        pincode: "560102",
        latitude: 12.9145,
        longitude: 77.6432,
        isDefault: true,
      },
    })
  }

  await prisma.user.upsert({
    where: { phone: "+919900000011" },
    update: {},
    create: {
      phone: "+919900000011",
      passwordHash,
      role: Role.CUSTOMER,
      name: "Karthik N",
    },
  })

  console.log(
    `Seed complete. Login password for every seeded user: "${SEED_PASSWORD}".`,
  )
  console.log("Admin login: phone +919900000000")
  console.log("Owners:")
  console.log(`  - ${storeA.name} → owner phone ${ownerA.phone}`)
  console.log(`  - ${storeB.name} → owner phone ${ownerB.phone}`)
  console.log("Customers: +919900000010 (Anita), +919900000011 (Karthik)")
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

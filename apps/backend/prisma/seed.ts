/**
 * Seed script — creates a small, deterministic dataset for local dev:
 *   - 4 categories (global)
 *   - 1 admin + 2 owners + 2 customers (via better-auth signUpEmail so the
 *     password hash matches what better-auth expects on sign-in)
 *   - 2 stores at real Bangalore coordinates
 *   - 6 products per store across the categories
 *   - 1 default address near the stores
 *
 * Idempotent: re-running won't duplicate rows.
 *
 * Login credentials after seed (password is the same for all): see SEED_PASSWORD.
 *   admin@kirana.local
 *   ramesh@kirana.local         (owner of Sri Krishna Kirana — auto-approved)
 *   suman@kirana.local          (owner of Reddy Provisions — auto-approved)
 *   anita@kirana.local          (customer)
 *   karthik@kirana.local        (customer)
 *
 * Phones still seeded as profile data (kept identical to pre-6.5 seed so any
 * external runbooks that reference them still work):
 *   admin    +919900000000
 *   ramesh   +919900000001
 *   suman    +919900000002
 *   anita    +919900000010
 *   karthik  +919900000011
 */

import { prisma } from "../src/db/prisma.js"
import { Role, Unit } from "../src/generated/prisma/enums.js"
import { auth } from "../src/lib/auth.js"

const SEED_PASSWORD = "Password123!"

interface SeedUserSpec {
  email: string
  name: string
  phone: string
  role: Role
  approve: boolean
}

/**
 * Idempotent user seed via the better-auth signup API — guarantees the
 * password hash is in the exact format better-auth's signIn.email expects.
 *
 * Trick: we ALWAYS signup as CUSTOMER (which the create hook allows), then
 * patch the row to the desired role + approval state. That sidesteps the
 * hook's ADMIN-signup-closed rule and the OWNER pending-approval gate, both
 * of which exist for the public surface but are unwanted in seed.
 */
async function upsertSeedUser(spec: SeedUserSpec): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({
    where: { email: spec.email },
    select: { id: true, role: true, isApproved: true, phone: true },
  })
  if (existing !== null) {
    // Drift-correct: re-seed should bring an existing row back in line.
    const needsPatch =
      existing.role !== spec.role ||
      existing.isApproved !== spec.approve ||
      existing.phone !== spec.phone
    if (needsPatch) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: spec.role,
          isApproved: spec.approve,
          phone: spec.phone,
          approvedAt: spec.approve ? new Date() : null,
        },
      })
    }
    return { id: existing.id }
  }

  await auth.api.signUpEmail({
    body: {
      email: spec.email,
      password: SEED_PASSWORD,
      name: spec.name,
      // Additional fields recognised by lib/auth.ts user.additionalFields.
      // We always signup as CUSTOMER and patch below — keeps the seed off
      // the OWNER pending-approval path and the ADMIN-closed gate.
      phone: spec.phone,
      role: Role.CUSTOMER,
    },
  })

  const fresh = await prisma.user.findUniqueOrThrow({
    where: { email: spec.email },
    select: { id: true },
  })

  if (spec.role !== Role.CUSTOMER || !spec.approve) {
    await prisma.user.update({
      where: { id: fresh.id },
      data: {
        role: spec.role,
        isApproved: spec.approve,
        approvedAt: spec.approve ? new Date() : null,
      },
    })
  }
  return fresh
}

async function main(): Promise<void> {
  // Phase 6.6 — Departments (L1, admin-owned, global). Ids match the
  // hardcoded ones the taxonomy migration seeds, so a fresh `db:reset`
  // followed by `db:seed` lands on the same id space.
  const departmentsSpec = [
    { id: "dept_grocery_kitchen", name: "Grocery & Kitchen",      displayOrder: 10 },
    { id: "dept_snacks_drinks",   name: "Snacks & Drinks",        displayOrder: 20 },
    { id: "dept_beauty_personal", name: "Beauty & Personal Care", displayOrder: 30 },
    { id: "dept_household",       name: "Household Essentials",   displayOrder: 40 },
  ]
  for (const d of departmentsSpec) {
    await prisma.department.upsert({
      where: { id: d.id },
      update: { name: d.name, displayOrder: d.displayOrder },
      create: d,
    })
  }

  // Categories (L2, admin-owned). (departmentId, name) is the composite
  // unique — the same name can exist under two departments.
  const categoriesSpec = [
    { departmentId: "dept_grocery_kitchen", name: "Atta, Rice & Dal",   displayOrder: 10 },
    { departmentId: "dept_grocery_kitchen", name: "Dairy & Eggs",       displayOrder: 20 },
    { departmentId: "dept_snacks_drinks",   name: "Snacks & Beverages", displayOrder: 30 },
    { departmentId: "dept_beauty_personal", name: "Personal Care",      displayOrder: 40 },
  ]
  const categories = await Promise.all(
    categoriesSpec.map((c) =>
      prisma.category.upsert({
        where: { departmentId_name: { departmentId: c.departmentId, name: c.name } },
        update: { displayOrder: c.displayOrder },
        create: c,
      }),
    ),
  )
  const catByName = new Map(categories.map((c) => [c.name, c]))
  const catId = (name: string): string => {
    const found = catByName.get(name)
    if (!found) throw new Error(`Seed bug: category not found: ${name}`)
    return found.id
  }

  // Users (admin + owners + customers).
  const admin = await upsertSeedUser({
    email: "admin@kirana.local",
    name: "Marketplace Admin",
    phone: "+919900000000",
    role: Role.ADMIN,
    approve: true,
  })
  const ownerA = await upsertSeedUser({
    email: "ramesh@kirana.local",
    name: "Ramesh Kumar",
    phone: "+919900000001",
    role: Role.OWNER,
    approve: true,
  })
  const ownerB = await upsertSeedUser({
    email: "suman@kirana.local",
    name: "Suman Reddy",
    phone: "+919900000002",
    role: Role.OWNER,
    approve: true,
  })
  const customerAnita = await upsertSeedUser({
    email: "anita@kirana.local",
    name: "Anita Sharma",
    phone: "+919900000010",
    role: Role.CUSTOMER,
    approve: true,
  })
  await upsertSeedUser({
    email: "karthik@kirana.local",
    name: "Karthik N",
    phone: "+919900000011",
    role: Role.CUSTOMER,
    approve: true,
  })
  void admin // referenced for log clarity below; no further use in seed

  // Stores.
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

  // Subcategories (L3, store-owned). Seed creates exactly one Subcategory
  // per (store, category) we'll seed products under — named after the
  // category, since the owner hasn't curated their own L3 layout yet.
  // The taxonomy migration already created these for any pre-existing
  // products; the upsert here is the source-of-truth on a fresh reset.
  async function subId(
    storeId: string,
    categoryName: string,
  ): Promise<string> {
    const categoryId = catId(categoryName)
    const sub = await prisma.subcategory.upsert({
      where: {
        storeId_categoryId_name: { storeId, categoryId, name: categoryName },
      },
      update: {},
      create: {
        storeId,
        categoryId,
        name: categoryName,
        displayOrder: 0,
        isAvailable: true,
      },
    })
    return sub.id
  }

  // Products per store. (storeId, name) is not unique in the schema — we
  // identify by find-then-create for idempotent re-seeds.
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
      if (p.aliases !== undefined) {
        await prisma.product.update({
          where: { id: existing.id },
          data: { searchAliases: p.aliases.map((a) => a.toLowerCase()) },
        })
      }
      continue
    }
    const subcategoryId = await subId(p.store.id, p.category)
    await prisma.product.create({
      data: {
        storeId: p.store.id,
        subcategoryId,
        name: p.name,
        pricePaise: p.pricePaise,
        unit: p.unit,
        isActive: true,
        isAvailable: true,
        searchAliases: (p.aliases ?? []).map((a) => a.toLowerCase()),
      },
    })
  }

  // Customer default address near the stores.
  const existingAddr = await prisma.address.findFirst({
    where: { customerId: customerAnita.id, label: "Home" },
  })
  if (!existingAddr) {
    await prisma.address.create({
      data: {
        customerId: customerAnita.id,
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

  console.log(`\nSeed complete. Password for every seeded user: "${SEED_PASSWORD}"`)
  console.log("Logins:")
  console.log("  admin    → admin@kirana.local")
  console.log(`  owners   → ramesh@kirana.local  (${storeA.name})`)
  console.log(`             suman@kirana.local   (${storeB.name})`)
  console.log("  customers → anita@kirana.local  (has default address)")
  console.log("              karthik@kirana.local")
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

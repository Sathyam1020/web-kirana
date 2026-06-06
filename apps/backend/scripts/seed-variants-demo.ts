/**
 * One-off seed: enrich a few products in a target store with multiple
 * variants so the IP-2 demo UI (product-card-compact "X sizes" + variant
 * picker sheet) has something interesting to render. Skips products that
 * already have >1 variant so re-running is idempotent.
 *
 * Usage:
 *   STORE_ID=<id> npx tsx scripts/seed-variants-demo.ts
 */

import { prisma } from "../src/db/prisma.js"
import { Unit } from "../src/generated/prisma/enums.js"

const STORE_ID = process.env.STORE_ID ?? "cmps45oao0000mh1d3qxw2ejc"

// Each entry adds a few size variants atop the product's existing
// "Default" backfilled variant. Prices are percentage offsets from the
// product's existing pricePaise so the demo math reads sensibly.
const PROFILE_BY_HINT: Array<{
  match: RegExp
  variants: Array<{ name: string; unitValue: number; unit: Unit; priceMultiplier: number }>
}> = [
  {
    match: /(coke|pepsi|thumb|cola|sprite|soda|drink|kingfisher|fanta|frooti|maaza|tropicana|juice|water|aquafina|bisleri)/i,
    variants: [
      { name: "2 x 750 ml", unitValue: 2, unit: Unit.ML, priceMultiplier: 1.95 },
      { name: "4 x 750 ml", unitValue: 4, unit: Unit.ML, priceMultiplier: 3.85 },
    ],
  },
  {
    match: /(atta|flour|maida|rice|sugar|dal|pulse|rajma|chana|moong)/i,
    variants: [
      { name: "500 g", unitValue: 500, unit: Unit.G, priceMultiplier: 0.55 },
      { name: "10 kg", unitValue: 10, unit: Unit.KG, priceMultiplier: 1.85 },
    ],
  },
  {
    match: /(milk|curd|yogurt|dahi|paneer|butter|ghee|cheese|cream|amul|nandini)/i,
    variants: [
      { name: "250 ml", unitValue: 250, unit: Unit.ML, priceMultiplier: 0.55 },
      { name: "2 L", unitValue: 2, unit: Unit.L, priceMultiplier: 1.9 },
    ],
  },
  {
    match: /(biscuit|chips|namkeen|parle|maggi|noodle|wafer|chocolate|kurkure|haldiram|lay|britannia|oreo)/i,
    variants: [
      { name: "Pack of 6", unitValue: 6, unit: Unit.PIECE, priceMultiplier: 5.7 },
      { name: "Pack of 12", unitValue: 12, unit: Unit.PIECE, priceMultiplier: 11.2 },
    ],
  },
]

// Generic fallback when nothing else matches — just adds 2 size options
// based on the product's existing unit. Ensures we always seed something.
function fallbackProfile(p: { unit: Unit; pricePaise: number }): {
  name: string
  unitValue: number
  unit: Unit
  priceMultiplier: number
}[] {
  return [
    { name: "Small pack", unitValue: 1, unit: p.unit, priceMultiplier: 0.7 },
    { name: "Family pack", unitValue: 2, unit: p.unit, priceMultiplier: 1.85 },
  ]
}

async function main(): Promise<void> {
  console.log(`Seeding variants for products in store ${STORE_ID}…`)

  const products = await prisma.product.findMany({
    where: { storeId: STORE_ID, isActive: true },
    select: {
      id: true,
      name: true,
      pricePaise: true,
      unit: true,
      variants: { select: { id: true, name: true } },
    },
  })
  console.log(`  ${products.length} products in store`)
  console.log(`  product names: ${products.map((p) => p.name).join(", ")}`)

  let touched = 0
  for (const p of products) {
    if (p.variants.length > 1) continue // already enriched

    const hitProfile = PROFILE_BY_HINT.find((pr) => pr.match.test(p.name))
    const variants = hitProfile?.variants ?? fallbackProfile(p)

    let added = 0
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i]
      if (v === undefined) continue
      try {
        // NB: ProductVariant.storeId is a DB-only column maintained by
        // the `variant_set_store_id_trg` trigger (added in
        // 20260603083100). It's NOT in the Prisma model — Prisma create
        // would reject if we passed it. The trigger fires BEFORE INSERT
        // and copies storeId from the parent Product.
        await prisma.productVariant.create({
          data: {
            productId: p.id,
            name: v.name,
            unitValue: v.unitValue.toString(),
            unit: v.unit,
            pricePaise: Math.round(p.pricePaise * v.priceMultiplier),
            isAvailable: true,
            isDefault: false,
            sortOrder: i + 1,
          },
        })
        added += 1
      } catch (err) {
        console.warn(`  ! ${p.name} — variant "${v.name}" failed:`)
        console.warn(err)
      }
    }
    if (added > 0) {
      console.log(`  ✓ ${p.name}: +${added} variants`)
      touched += 1
    }
  }

  console.log(`Done — enriched ${touched} products.`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

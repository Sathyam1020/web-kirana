// Quick DB-state inspector: lists user tables, checks postgis extension,
// confirms the geography column + GiST index on Store.

import { prisma } from "../src/db/prisma.js"

type RawRow = Record<string, unknown>

async function main(): Promise<void> {
  const tables = await prisma.$queryRawUnsafe<RawRow[]>(
    "SELECT tablename::text AS tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  )
  console.log("Tables in public schema:")
  for (const row of tables) console.log("  -", row.tablename)

  const ext = await prisma.$queryRawUnsafe<RawRow[]>(
    "SELECT extname::text AS extname, extversion FROM pg_extension WHERE extname = 'postgis'",
  )
  console.log("\nPostGIS extension:", ext.length === 0 ? "NOT INSTALLED" : ext)

  const col = await prisma.$queryRawUnsafe<RawRow[]>(
    "SELECT column_name::text AS column_name, udt_name::text AS udt_name FROM information_schema.columns WHERE table_name = 'Store' AND column_name = 'location'",
  )
  console.log("Store.location column:", col)

  const idx = await prisma.$queryRawUnsafe<RawRow[]>(
    "SELECT indexname::text AS indexname, indexdef FROM pg_indexes WHERE tablename = 'Store' AND indexname = 'Store_location_gist_idx'",
  )
  console.log("GiST index on Store.location:", idx)

  const trg = await prisma.$queryRawUnsafe<RawRow[]>(
    "SELECT trigger_name::text AS trigger_name, event_manipulation::text AS event_manipulation FROM information_schema.triggers WHERE event_object_table = 'Store'",
  )
  console.log("Triggers on Store:", trg)

  const migrations = await prisma.$queryRawUnsafe<RawRow[]>(
    "SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at",
  )
  console.log("\n_prisma_migrations:")
  for (const row of migrations) console.log(" ", row)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})

import "dotenv/config"
import { defineConfig, env } from "prisma/config"

// Prisma 7 contract:
//  - This file owns the CLI's connection (used by `prisma migrate`,
//    `prisma generate`, `prisma db push`, etc.).
//  - The runtime PrismaClient is built separately in src/db/prisma.ts using
//    @prisma/adapter-neon against DATABASE_URL (Neon's pooled URL).
//  - DIRECT_URL is the unpooled Neon URL — required because pgbouncer in
//    transaction mode cannot host Migrate's advisory locks / prepared
//    statements.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
})

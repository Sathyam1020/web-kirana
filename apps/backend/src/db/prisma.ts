import { PrismaNeon } from "@prisma/adapter-neon"
import { env } from "../config/env.js"
import { PrismaClient } from "../generated/prisma/client.js"

// Singleton — instantiated once per Node process. The Neon adapter holds
// the connection pool internally over Neon's pooled DATABASE_URL.
const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL })

export const prisma = new PrismaClient({ adapter })

export async function disconnect(): Promise<void> {
  await prisma.$disconnect()
}

import { PrismaNeon } from "@prisma/adapter-neon"
import { neonConfig } from "@neondatabase/serverless"
import ws from "ws"
import { env } from "../config/env.js"
import { PrismaClient } from "../generated/prisma/client.js"

// Neon's serverless driver opens a WebSocket to talk to the pooled endpoint.
// Node 22+ has WebSocket built-in (works "by accident" on dev Macs running
// recent Node); Node 20 (our Railway container) does not, and the driver
// fails to connect with no useful error. Explicitly hand it `ws` so it works
// regardless of the Node version.
neonConfig.webSocketConstructor = ws

// Singleton — instantiated once per Node process. The Neon adapter holds
// the connection pool internally over Neon's pooled DATABASE_URL.
const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL })

export const prisma = new PrismaClient({ adapter })

export async function disconnect(): Promise<void> {
  await prisma.$disconnect()
}

import { createServer } from "node:http"
import { buildApp } from "./app.js"
import { env } from "./config/env.js"
import { disconnect as disconnectDb } from "./db/prisma.js"
import { logger } from "./lib/logger.js"
import { initRealtime } from "./realtime/index.js"

const app = buildApp()
const server = createServer(app)
const io = initRealtime(server)

// Track in-flight sockets so graceful shutdown can drain them.
const sockets = new Set<import("node:net").Socket>()
server.on("connection", (socket) => {
  sockets.add(socket)
  socket.once("close", () => sockets.delete(socket))
})

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "backend listening")
})

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const
const SHUTDOWN_TIMEOUT_MS = 10_000
let shuttingDown = false

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, "graceful shutdown starting")

  const force = setTimeout(() => {
    logger.error({ openSockets: sockets.size }, "shutdown timeout — forcing exit")
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  force.unref()

  // Close Socket.IO first so it stops accepting connections and disconnects
  // clients, then drain the HTTP server.
  await io.close().catch((err) => logger.warn({ err }, "socket.io close failed"))

  await new Promise<void>((resolve) => {
    server.close(() => resolve())
    for (const socket of sockets) socket.end()
  })

  await disconnectDb().catch((err) => logger.warn({ err }, "prisma disconnect failed"))

  logger.info("graceful shutdown complete")
  process.exit(0)
}

for (const signal of SHUTDOWN_SIGNALS) {
  process.on(signal, () => {
    void shutdown(signal)
  })
}

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled promise rejection")
  process.exit(1)
})

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception")
  process.exit(1)
})

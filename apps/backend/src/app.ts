import express, { type Express, type Request, type Response } from "express"
import { prisma } from "./db/prisma.js"
import { logger } from "./lib/logger.js"
import { httpLogger } from "./middleware/request-id.js"

export function buildApp(): Express {
  const app = express()

  app.disable("x-powered-by")
  app.set("trust proxy", 1)

  app.use(httpLogger)
  app.use(express.json({ limit: "1mb" }))

  // Liveness — cheap, no external deps.
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ data: { status: "ok" } })
  })

  // Readiness — pings the DB. A 503 here tells orchestrators to stop sending traffic.
  app.get("/readyz", async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.status(200).json({ data: { status: "ready" } })
    } catch (err) {
      logger.error({ err }, "readyz: DB ping failed")
      res.status(503).json({
        error: { code: "NOT_READY", message: "database unreachable" },
      })
    }
  })

  return app
}

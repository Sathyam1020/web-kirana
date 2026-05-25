import express, { type Express, type Request, type Response } from "express"
import { httpLogger } from "./middleware/request-id.js"

export function buildApp(): Express {
  const app = express()

  app.disable("x-powered-by")
  app.set("trust proxy", 1)

  app.use(httpLogger)
  app.use(express.json({ limit: "1mb" }))

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ data: { status: "ok" } })
  })

  app.get("/readyz", (_req: Request, res: Response) => {
    // Phase 1 wires this to a real Prisma ping.
    res.status(200).json({ data: { status: "ready" } })
  })

  return app
}

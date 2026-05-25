import cookieParser from "cookie-parser"
import express, { type Express, type Request, type Response, Router } from "express"
import helmet from "helmet"
import { prisma } from "./db/prisma.js"
import { logger } from "./lib/logger.js"
import { sendData } from "./lib/response.js"
import { corsMiddleware } from "./middleware/cors.js"
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js"
import { globalRateLimiter } from "./middleware/rate-limit.js"
import { httpLogger } from "./middleware/request-id.js"
import { adminRouter } from "./modules/admin/admin.routes.js"
import { authRouter } from "./modules/auth/auth.routes.js"
import { categoriesPublicRouter } from "./modules/categories/categories.routes.js"
import { storesRouter } from "./modules/stores/stores.routes.js"

export function buildApp(): Express {
  const app = express()

  app.disable("x-powered-by")
  app.set("trust proxy", 1)

  app.use(helmet())
  app.use(corsMiddleware)

  app.use(httpLogger)
  app.use(express.json({ limit: "1mb" }))
  app.use(cookieParser())

  app.use(globalRateLimiter)

  // --- Health endpoints --------------------------------------------------
  app.get("/health", (_req: Request, res: Response) => {
    sendData(res, { status: "ok" })
  })

  app.get("/readyz", async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      sendData(res, { status: "ready" })
    } catch (err) {
      logger.error({ err }, "readyz: DB ping failed")
      res.status(503).json({
        error: { code: "NOT_READY", message: "database unreachable" },
      })
    }
  })

  // --- v1 router ---------------------------------------------------------
  const v1 = Router()
  v1.use("/auth", authRouter)
  v1.use("/admin", adminRouter)
  v1.use("/categories", categoriesPublicRouter)
  v1.use("/stores", storesRouter)

  app.use("/v1", v1)

  // 404 then error handler must be the LAST middleware. Order matters.
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

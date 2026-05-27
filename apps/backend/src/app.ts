import { toNodeHandler } from "better-auth/node"
import express, { type Express, type Request, type Response, Router } from "express"
import helmet from "helmet"
import { prisma } from "./db/prisma.js"
import { auth } from "./lib/auth.js"
import { logger } from "./lib/logger.js"
import { sendData } from "./lib/response.js"
import { corsMiddleware } from "./middleware/cors.js"
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js"
import { globalRateLimiter } from "./middleware/rate-limit.js"
import { httpLogger } from "./middleware/request-id.js"
import { addressesRouter } from "./modules/addresses/addresses.routes.js"
import { adminRouter } from "./modules/admin/admin.routes.js"
import { categoriesPublicRouter } from "./modules/categories/categories.routes.js"
import { couponsPublicRouter } from "./modules/coupons/coupons.routes.js"
import { searchRouter } from "./modules/search/search.routes.js"
import { storesPublicRouter, storesRouter } from "./modules/stores/stores.routes.js"

export function buildApp(): Express {
  const app = express()

  app.disable("x-powered-by")
  app.set("trust proxy", 1)

  app.use(helmet())
  app.use(corsMiddleware)

  app.use(httpLogger)

  // IMPORTANT: better-auth handler must mount BEFORE express.json() —
  // better-auth needs to control body parsing on its own routes. The
  // /v1/auth/*splat catch-all matches Express 5's named-wildcard syntax.
  app.all("/v1/auth/*splat", toNodeHandler(auth))

  app.use(express.json({ limit: "1mb" }))

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
  // /v1/auth/* is owned by better-auth (mounted directly on `app` above so
  // it sits ahead of express.json()). The rest of the v1 surface lives here.
  const v1 = Router()
  v1.use("/admin", adminRouter)
  v1.use("/addresses", addressesRouter)
  v1.use("/categories", categoriesPublicRouter)
  v1.use("/coupons", couponsPublicRouter)
  v1.use("/search", searchRouter)
  // Phase 5: public discovery mounted BEFORE owner-side router. Explicit
  // GETs on storesPublicRouter (/nearby, /:id, /:id/products) handle public
  // paths; the /:id handlers call next() when id === "me" so /v1/stores/me
  // falls through to the owner-side storesRouter.
  v1.use("/stores", storesPublicRouter)
  v1.use("/stores", storesRouter)

  app.use("/v1", v1)

  // 404 then error handler must be the LAST middleware. Order matters.
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

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
import { departmentsPublicRouter } from "./modules/departments/departments.routes.js"
import { searchRouter } from "./modules/search/search.routes.js"
import { storesPublicRouter, storesRouter } from "./modules/stores/stores.routes.js"

export function buildApp(): Express {
  const app = express()

  app.disable("x-powered-by")
  app.set("trust proxy", 1)

  app.use(helmet())
  app.use(corsMiddleware)

  app.use(httpLogger)

  // IMPORTANT: better-auth handler MUST mount BEFORE express.json() —
  // better-auth parses its own bodies, and an upstream json() corrupts
  // multipart/sign-up bodies.
  //
  // Why `app.all` + mount-pattern instead of `app.use("/v1/auth", ...)`:
  // mount-style strips the prefix from req.url before the handler sees it.
  // toNodeHandler then matches against the bare path (`/sign-up/email`)
  // which works because we also set `basePath: "/v1/auth"` in auth.ts.
  // Either form is valid; the `app.all` form preserves req.url, which
  // some better-auth telemetry / log lines reference.
  //
  // The trailing `*` is path-to-regexp's catch-all in Express 5
  // (path-to-regexp v8). DO NOT change to `*splat` — that's the prior
  // syntax that some older versions of path-to-regexp accept and the
  // newer one silently drops, sending /v1/auth/get-session through to
  // the v1 router (which has no /auth mount) and bouncing it through
  // our error handler with a misleading FORBIDDEN envelope.
  app.all("/v1/auth/{*splat}", toNodeHandler(auth))

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
  v1.use("/departments", departmentsPublicRouter)
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

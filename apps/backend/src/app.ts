import cookieParser from "cookie-parser"
import express, { type Express, type Request, type Response, Router } from "express"
import helmet from "helmet"
import { z } from "zod"
import { prisma } from "./db/prisma.js"
import { logger } from "./lib/logger.js"
import { sendData } from "./lib/response.js"
import { corsMiddleware } from "./middleware/cors.js"
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js"
import { globalRateLimiter } from "./middleware/rate-limit.js"
import { httpLogger } from "./middleware/request-id.js"
import { validate } from "./middleware/validate.js"
import { adminRouter } from "./modules/admin/admin.routes.js"
import { authRouter } from "./modules/auth/auth.routes.js"

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

  // Sample echo route — kept until later phases replace it with real domain
  // endpoints. Validates the pipeline end-to-end during dev.
  const echoBody = z.strictObject({
    message: z.string().min(1).max(280),
    times: z.number().int().min(1).max(10).optional().default(1),
  })
  v1.post(
    "/echo",
    validate({ body: echoBody }),
    (req: Request, res: Response) => {
      const { message, times } = req.body as z.infer<typeof echoBody>
      sendData(res, { message, repeated: Array.from({ length: times }, () => message) })
    },
  )

  app.use("/v1", v1)

  // 404 then error handler must be the LAST middleware. Order matters.
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

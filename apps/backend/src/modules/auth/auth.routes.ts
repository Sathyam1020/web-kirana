import { Router } from "express"
import {
  loginLimiter,
  refreshLimiter,
  signupLimiter,
} from "../../middleware/auth-rate-limit.js"
import { requireAuth } from "../../middleware/auth.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./auth.controller.js"
import { loginBodySchema, signupBodySchema } from "./auth.schemas.js"

export const authRouter: Router = Router()

authRouter.post(
  "/signup",
  signupLimiter,
  validate({ body: signupBodySchema }),
  controller.signup,
)

authRouter.post(
  "/login",
  loginLimiter,
  validate({ body: loginBodySchema }),
  controller.login,
)

authRouter.post("/refresh", refreshLimiter, controller.refresh)

authRouter.post("/logout", controller.logout)

authRouter.get("/me", requireAuth, controller.me)

import type { Request, Response } from "express"
import { UnauthorizedError } from "../../lib/errors.js"
import { sendData } from "../../lib/response.js"
import * as service from "./me.service.js"

export async function stats(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  sendData(res, await service.getMeStats(req.user.id))
}

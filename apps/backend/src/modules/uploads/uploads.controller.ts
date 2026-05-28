import type { Request, Response } from "express"
import { UnauthorizedError } from "../../lib/errors.js"
import { sendData } from "../../lib/response.js"
import * as service from "./uploads.service.js"
import type { AdminSignatureBody, OwnerSignatureBody } from "./uploads.schemas.js"

export async function ownerSignature(req: Request, res: Response): Promise<void> {
  // requireOwnStore runs before this and sets req.ownStore.
  if (req.ownStore === undefined) {
    throw new UnauthorizedError("requireOwnStore must run before ownerSignature")
  }
  const body = req.body as OwnerSignatureBody
  const signature = service.signOwnerUpload(req.ownStore.id, body.scope)
  sendData(res, signature)
}

export async function adminSignature(req: Request, res: Response): Promise<void> {
  const body = req.body as AdminSignatureBody
  const signature = service.signAdminUpload(body.scope)
  sendData(res, signature)
}

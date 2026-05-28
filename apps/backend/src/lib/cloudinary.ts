/**
 * Cloudinary signed-upload helper (Phase 6.7).
 *
 * We never proxy image bytes through our API. The browser uploads directly to
 * Cloudinary; our only job is to hand it a short-lived signature for a
 * server-controlled folder.
 *
 * Signing notes (verified against the SDK + docs — see PROGRESS.md 6.7):
 *   - `cloudinary.utils.api_sign_request(paramsToSign, apiSecret)` is the exact
 *     mechanism the SDK's own `uploader.upload` uses, so it's guaranteed
 *     compatible with Cloudinary's upload endpoint. We use the SDK default
 *     signature version (do NOT pin v1 — security-hardened accounts may reject
 *     it).
 *   - We sign the MINIMAL set ({ folder, timestamp }). The #1 cause of
 *     "Invalid Signature" is signed-params ≠ posted-params, so the browser must
 *     POST exactly { file, api_key, timestamp, signature, folder } and nothing
 *     else. Raw values go over the wire; any encoding is internal to both the
 *     signer here and Cloudinary's verifier.
 *   - `api_key`, `cloud_name`, `resource_type`, `file` are never signed.
 */

import { v2 as cloudinary } from "cloudinary"
import { env } from "../config/env.js"
import { ServiceUnavailableError } from "./errors.js"

const configured =
  Boolean(env.CLOUDINARY_CLOUD_NAME) &&
  Boolean(env.CLOUDINARY_API_KEY) &&
  Boolean(env.CLOUDINARY_API_SECRET)

if (configured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  })
}

export function isUploadConfigured(): boolean {
  return configured
}

export interface UploadSignature {
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  folder: string
}

/**
 * Signs an upload to `folder`. Throws 503 if Cloudinary env vars aren't set
 * (so dev works without credentials; uploads simply fail with a clear code).
 */
export function signUpload(folder: string): UploadSignature {
  if (!configured) {
    throw new ServiceUnavailableError("Image uploads are not configured")
  }
  const timestamp = Math.round(Date.now() / 1000)
  const signature = cloudinary.utils.api_sign_request(
    { folder, timestamp },
    // Non-null: `configured` guarantees this is set.
    env.CLOUDINARY_API_SECRET as string,
  )
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME as string,
    apiKey: env.CLOUDINARY_API_KEY as string,
    timestamp,
    signature,
    folder,
  }
}

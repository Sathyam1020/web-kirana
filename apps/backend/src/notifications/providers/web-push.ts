import webpush from "web-push"
import { env } from "../../config/env.js"
import { logger } from "../../lib/logger.js"

/**
 * Web Push provider (Phase 10). No-ops until a VAPID keypair is configured, so
 * the backend boots without it. Generate keys once with
 * `npx web-push generate-vapid-keys` and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
 */

const publicKey = env.VAPID_PUBLIC_KEY
const privateKey = env.VAPID_PRIVATE_KEY
const configured = Boolean(publicKey && privateKey)
if (publicKey !== undefined && privateKey !== undefined) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, publicKey, privateKey)
}

export function isWebPushConfigured(): boolean {
  return configured
}

export interface WebPushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface WebPushPayload {
  title: string
  body: string
  /** Where the service worker navigates on notificationclick. */
  url: string
  /** Collapse key so successive updates for the same order replace each other. */
  tag?: string
}

export type WebPushResult = "ok" | "gone" | "error"

/**
 * Send one push. Returns "gone" for a dead subscription (404/410) so the caller
 * can prune it, "error" for transient/unconfigured, "ok" otherwise.
 */
export async function sendWebPush(
  target: WebPushTarget,
  payload: WebPushPayload,
): Promise<WebPushResult> {
  if (!configured) return "error"
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
    )
    return "ok"
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) return "gone"
    logger.warn({ err, statusCode: status }, "web-push: send failed")
    return "error"
  }
}

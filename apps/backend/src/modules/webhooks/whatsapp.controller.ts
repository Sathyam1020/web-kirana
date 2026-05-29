import crypto from "node:crypto"
import type { Request, Response } from "express"
import { env } from "../../config/env.js"
import { prisma } from "../../db/prisma.js"
import { WhatsAppMessageStatus } from "../../generated/prisma/enums.js"
import { logger } from "../../lib/logger.js"

/**
 * Verify Meta's `X-Hub-Signature-256` against the RAW request body. Pure +
 * exported so it's unit-testable without env. Fails closed when the secret is
 * missing or the header is malformed; uses a timing-safe compare.
 */
export function verifyWhatsAppSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string | undefined,
): boolean {
  if (secret === undefined || secret.length === 0) return false
  if (signatureHeader === undefined || !signatureHeader.startsWith("sha256=")) return false
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function timingSafeStrEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

/** GET — Meta's subscription verification handshake (echo hub.challenge). */
export function verify(req: Request, res: Response): void {
  const mode = req.query["hub.mode"]
  const token = req.query["hub.verify_token"]
  const challenge = req.query["hub.challenge"]
  if (
    mode === "subscribe" &&
    typeof token === "string" &&
    env.WHATSAPP_VERIFY_TOKEN !== undefined &&
    timingSafeStrEqual(token, env.WHATSAPP_VERIFY_TOKEN)
  ) {
    res.status(200).send(typeof challenge === "string" ? challenge : "")
    return
  }
  res.sendStatus(403)
}

// Allowed prior statuses for each receipt, so a replayed or out-of-order
// receipt can only advance the row (never regress DELIVERED → SENT, etc.).
const ALLOWED_PREV: Record<WhatsAppMessageStatus, WhatsAppMessageStatus[]> = {
  [WhatsAppMessageStatus.PENDING]: [],
  [WhatsAppMessageStatus.SENT]: [WhatsAppMessageStatus.PENDING],
  [WhatsAppMessageStatus.DELIVERED]: [WhatsAppMessageStatus.PENDING, WhatsAppMessageStatus.SENT],
  [WhatsAppMessageStatus.READ]: [
    WhatsAppMessageStatus.PENDING,
    WhatsAppMessageStatus.SENT,
    WhatsAppMessageStatus.DELIVERED,
  ],
  [WhatsAppMessageStatus.FAILED]: [WhatsAppMessageStatus.PENDING, WhatsAppMessageStatus.SENT],
}

function mapStatus(status: unknown): WhatsAppMessageStatus | null {
  switch (status) {
    case "sent":
      return WhatsAppMessageStatus.SENT
    case "delivered":
      return WhatsAppMessageStatus.DELIVERED
    case "read":
      return WhatsAppMessageStatus.READ
    case "failed":
      return WhatsAppMessageStatus.FAILED
    default:
      return null
  }
}

interface WebhookBody {
  entry?: { changes?: { value?: { statuses?: { id?: string; status?: string }[] } }[] }[]
}

/** POST — delivery/read receipts. Signature-verified on the raw body, then
 *  correlated to outbox rows by waMessageId. Always 200s once authentic so
 *  Meta doesn't retry. */
export async function receive(req: Request, res: Response): Promise<void> {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("")
  if (!verifyWhatsAppSignature(raw, req.header("x-hub-signature-256"), env.WHATSAPP_APP_SECRET)) {
    res.sendStatus(403)
    return
  }

  let body: WebhookBody
  try {
    body = JSON.parse(raw.toString("utf8")) as WebhookBody
  } catch {
    res.sendStatus(400)
    return
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        const mapped = mapStatus(s.status)
        if (typeof s.id === "string" && mapped !== null) {
          await prisma.whatsAppMessageLog
            .updateMany({
              // Forward-only: a replay or out-of-order receipt can't regress.
              where: { waMessageId: s.id, status: { in: ALLOWED_PREV[mapped] } },
              data: { status: mapped },
            })
            .catch((err: unknown) => logger.warn({ err }, "whatsapp webhook: status update failed"))
        }
      }
    }
  }

  res.sendStatus(200)
}

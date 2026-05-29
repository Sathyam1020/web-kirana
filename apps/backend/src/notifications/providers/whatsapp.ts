import { env } from "../../config/env.js"
import { prisma } from "../../db/prisma.js"
import { Prisma } from "../../generated/prisma/client.js"
import { WhatsAppMessageStatus } from "../../generated/prisma/enums.js"
import { logger } from "../../lib/logger.js"

/**
 * WhatsApp Cloud API provider (Phase 10). Sends a pre-approved template message
 * via the Graph API and records every attempt in the WhatsAppMessageLog outbox
 * (so the webhook can later correlate delivery/read receipts by waMessageId).
 *
 * No-ops gracefully when unconfigured: it still writes an outbox row (marked
 * FAILED with a reason) so there's a trail, then returns — the backend never
 * needs Meta creds to boot or run.
 */

export function isWhatsAppConfigured(): boolean {
  return Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN)
}

export interface WhatsAppTemplateMessage {
  toPhone: string
  templateName: string
  languageCode?: string
  /** Ordered body variables ({{1}}, {{2}}, …). */
  bodyParams: string[]
  /** Dynamic suffix for the template's URL button (button index 0), if any. */
  buttonUrlParam?: string
}

function buildPayload(msg: WhatsAppTemplateMessage): Record<string, unknown> {
  const components: Record<string, unknown>[] = []
  if (msg.bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: msg.bodyParams.map((text) => ({ type: "text", text })),
    })
  }
  if (msg.buttonUrlParam !== undefined) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: msg.buttonUrlParam }],
    })
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: msg.toPhone,
    type: "template",
    template: {
      name: msg.templateName,
      language: { code: msg.languageCode ?? "en" },
      components,
    },
  }
}

const NOT_CONFIGURED = "WhatsApp not configured"
const MAX_ATTEMPTS = 3

/** POST a stored payload to the Graph API and record the outcome on its outbox
 *  row. Shared by the initial send and the Phase 11 retry sweep. */
async function dispatchToGraph(logId: string, payload: unknown, attempt: number): Promise<void> {
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[]
      error?: { code?: number; message?: string }
    }
    const waMessageId = data.messages?.[0]?.id
    if (res.ok && waMessageId !== undefined) {
      await prisma.whatsAppMessageLog.update({
        where: { id: logId },
        data: {
          status: WhatsAppMessageStatus.SENT,
          waMessageId,
          attempts: attempt,
          lastAttemptAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      })
    } else {
      await prisma.whatsAppMessageLog.update({
        where: { id: logId },
        data: {
          status: WhatsAppMessageStatus.FAILED,
          errorCode: String(data.error?.code ?? res.status),
          errorMessage: data.error?.message ?? "send failed",
          attempts: attempt,
          lastAttemptAt: new Date(),
        },
      })
      logger.warn({ status: res.status, error: data.error }, "whatsapp: send failed")
    }
  } catch (err) {
    await prisma.whatsAppMessageLog.update({
      where: { id: logId },
      data: {
        status: WhatsAppMessageStatus.FAILED,
        errorMessage: err instanceof Error ? err.message : "network error",
        attempts: attempt,
        lastAttemptAt: new Date(),
      },
    })
    logger.warn({ err }, "whatsapp: send threw")
  }
}

export async function sendWhatsAppTemplate(msg: WhatsAppTemplateMessage): Promise<void> {
  const payload = buildPayload(msg)
  const log = await prisma.whatsAppMessageLog.create({
    data: {
      toPhone: msg.toPhone,
      templateName: msg.templateName,
      payload: payload as Prisma.InputJsonValue,
      status: WhatsAppMessageStatus.PENDING,
    },
  })

  if (!isWhatsAppConfigured()) {
    await prisma.whatsAppMessageLog.update({
      where: { id: log.id },
      data: {
        status: WhatsAppMessageStatus.FAILED,
        errorMessage: NOT_CONFIGURED,
        lastAttemptAt: new Date(),
      },
    })
    return
  }

  await dispatchToGraph(log.id, payload, 1)
}

/**
 * Phase 11 cron — re-send transiently-failed messages. Skips "not configured"
 * rows and anything past MAX_ATTEMPTS. Returns how many it retried.
 */
export async function retryFailedWhatsApp(limit = 50): Promise<number> {
  if (!isWhatsAppConfigured()) return 0
  const rows = await prisma.whatsAppMessageLog.findMany({
    where: {
      status: WhatsAppMessageStatus.FAILED,
      attempts: { lt: MAX_ATTEMPTS },
      errorMessage: { not: NOT_CONFIGURED },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  })

  let retried = 0
  for (const row of rows) {
    // Claim the row first (FAILED → PENDING) so an overlapping/slow tick can't
    // re-select and double-send the same message. Only dispatch if we won.
    const claimed = await prisma.whatsAppMessageLog.updateMany({
      where: { id: row.id, status: WhatsAppMessageStatus.FAILED },
      data: { status: WhatsAppMessageStatus.PENDING, lastAttemptAt: new Date() },
    })
    if (claimed.count === 0) continue
    await dispatchToGraph(row.id, row.payload, row.attempts + 1)
    retried++
  }
  return retried
}

import cron from "node-cron"
import { env } from "../config/env.js"
import { logger } from "../lib/logger.js"
import { autoCancelStalePlacedOrders } from "../modules/orders/orders.service.js"
import { resetAvailabilityForOptedInStores } from "../modules/stores/stores.service.js"
import { retryFailedWhatsApp } from "../notifications/providers/whatsapp.js"

/**
 * In-process scheduled jobs (Phase 11). Correct for the single-instance MVP
 * deploy; a horizontally-scaled backend would need a distributed lock (or an
 * external scheduler hitting an endpoint) so a job doesn't run N times.
 *
 * Called once from server.ts — never from buildApp(), so tests don't schedule.
 * Each tick is wrapped so a failure is logged, never crashing the process.
 */
// Skip a tick if the previous run of the same job is still going, so a slow
// run can't overlap itself (which would double-process work).
const running = new Set<string>()

function runGuarded(name: string, fn: () => Promise<unknown>): void {
  if (running.has(name)) {
    logger.warn({ job: name }, "cron: previous run still in progress — skipping tick")
    return
  }
  running.add(name)
  fn()
    .then((result) => logger.info({ job: name, result }, "cron: job done"))
    .catch((err) => logger.error({ job: name, err }, "cron: job failed"))
    .finally(() => running.delete(name))
}

export function registerJobs(): void {
  if (env.NODE_ENV === "test") return

  // Auto-cancel stale PLACED orders — every 5 minutes.
  cron.schedule("*/5 * * * *", () => {
    const cutoff = new Date(Date.now() - env.ORDER_AUTO_CANCEL_MINUTES * 60_000)
    runGuarded("auto-cancel-stale-orders", () => autoCancelStalePlacedOrders(cutoff))
  })

  // Retry transiently-failed WhatsApp messages — every 2 minutes (no-op until
  // WhatsApp is configured).
  cron.schedule("*/2 * * * *", () => {
    runGuarded("whatsapp-retry", () => retryFailedWhatsApp())
  })

  // Daily availability reset for opted-in stores — 05:00 IST.
  cron.schedule(
    "0 5 * * *",
    () => {
      runGuarded("availability-reset", () => resetAvailabilityForOptedInStores())
    },
    { timezone: "Asia/Kolkata" },
  )

  logger.info("cron: jobs registered")
}

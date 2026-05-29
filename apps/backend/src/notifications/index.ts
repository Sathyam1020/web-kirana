import { events } from "../lib/events.js"
import { dispatchStatusChange, onOrderPlaced } from "./dispatch.js"

/**
 * Wire notification dispatch onto the domain event bus (Phase 10). Called once
 * from server.ts — deliberately NOT from buildApp(), so the test harness
 * doesn't auto-subscribe and fire notifications during unrelated suites; the
 * notifications test calls this explicitly.
 *
 * Handlers return their work promise so the bus wrapper (events.ts) catches
 * rejections — a failing notification can never break the mutation that
 * triggered it.
 */
export function registerNotifications(): void {
  events.on("order.placed", (e) => onOrderPlaced(e.orderId))
  events.on("order.status_changed", (e) =>
    dispatchStatusChange(e.orderId, e.toStatus, e.actorType),
  )
}

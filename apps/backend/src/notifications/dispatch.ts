import { prisma } from "../db/prisma.js"
import { sendWebPush, type WebPushPayload } from "./providers/web-push.js"
import { sendWhatsAppTemplate } from "./providers/whatsapp.js"

/**
 * Notification dispatch (Phase 10). Subscribes (via index.ts) to the same
 * domain events Phase 9 fans out over sockets, and turns them into out-of-app
 * notifications:
 *
 *   order.placed                         → owner: web-push + WhatsApp
 *   order.status_changed CANCELLED (cust)→ owner: web-push + WhatsApp
 *   order.status_changed ACCEPTED/OFD/
 *     DELIVERED/REJECTED (owner)         → customer: web-push
 *
 * The in-app realtime updates (Phase 9) are unaffected — these are the
 * away-from-screen channels.
 */

// Owner-only templates — must be created + approved in Meta Business Manager.
// See PHASE10.md for the exact body text + button spec to submit.
const WA_TEMPLATE_NEW_ORDER = "new_order_owner"
const WA_TEMPLATE_CANCELLED = "order_cancelled_owner"

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}
function shortId(orderId: string): string {
  return `#${orderId.slice(-6).toUpperCase()}`
}

interface OrderForNotify {
  id: string
  customerId: string
  totalPaise: number
  storeNameSnapshot: string
  customerNameSnapshot: string
  rejectionReason: string | null
  store: { ownerId: string; owner: { phone: string } }
}

function loadOrder(orderId: string): Promise<OrderForNotify | null> {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customerId: true,
      totalPaise: true,
      storeNameSnapshot: true,
      customerNameSnapshot: true,
      rejectionReason: true,
      store: { select: { ownerId: true, owner: { select: { phone: true } } } },
    },
  })
}

async function pushToUser(userId: string, payload: WebPushPayload): Promise<void> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } })
  await Promise.all(
    subs.map(async (s) => {
      const result = await sendWebPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        payload,
      )
      if (result === "gone") {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined)
      }
    }),
  )
}

export async function onOrderPlaced(orderId: string): Promise<void> {
  const order = await loadOrder(orderId)
  if (order === null) return
  await pushToUser(order.store.ownerId, {
    title: `New order · ${rupees(order.totalPaise)}`,
    body: `From ${order.customerNameSnapshot} · ${shortId(order.id)}`,
    url: `/orders/${order.id}`,
    tag: `order-${order.id}`,
  })
  await sendWhatsAppTemplate({
    toPhone: order.store.owner.phone,
    templateName: WA_TEMPLATE_NEW_ORDER,
    bodyParams: [order.customerNameSnapshot, shortId(order.id), rupees(order.totalPaise)],
    buttonUrlParam: order.id,
  })
}

async function onCustomerCancelled(orderId: string): Promise<void> {
  const order = await loadOrder(orderId)
  if (order === null) return
  await pushToUser(order.store.ownerId, {
    title: "Order cancelled",
    body: `${order.customerNameSnapshot} cancelled ${shortId(order.id)}`,
    url: `/orders/${order.id}`,
    tag: `order-${order.id}`,
  })
  await sendWhatsAppTemplate({
    toPhone: order.store.owner.phone,
    templateName: WA_TEMPLATE_CANCELLED,
    bodyParams: [order.customerNameSnapshot, shortId(order.id), rupees(order.totalPaise)],
    buttonUrlParam: order.id,
  })
}

const CUSTOMER_STATUS_COPY: Record<string, { title: string; body: (store: string) => string }> = {
  ACCEPTED: { title: "Order accepted", body: (s) => `${s} is preparing your order.` },
  OUT_FOR_DELIVERY: { title: "Out for delivery", body: (s) => `Your order from ${s} is on the way.` },
  DELIVERED: { title: "Delivered", body: (s) => `Your order from ${s} has arrived. Enjoy!` },
  REJECTED: { title: "Order rejected", body: (s) => `${s} couldn't accept your order.` },
}

async function onCustomerFacingStatus(orderId: string, toStatus: string): Promise<void> {
  const copy = CUSTOMER_STATUS_COPY[toStatus]
  if (copy === undefined) return
  const order = await loadOrder(orderId)
  if (order === null) return
  const body =
    toStatus === "REJECTED" && order.rejectionReason !== null
      ? `${order.storeNameSnapshot} couldn't accept your order: ${order.rejectionReason}`
      : copy.body(order.storeNameSnapshot)
  await pushToUser(order.customerId, {
    title: copy.title,
    body,
    url: `/orders/${order.id}`,
    tag: `order-${order.id}`,
  })
}

/** Routes a status change to the right recipient. Returns the work promise so
 *  the event bus wrapper can catch rejections. */
export function dispatchStatusChange(
  orderId: string,
  toStatus: string,
  actorType: string,
): Promise<void> {
  if (toStatus === "CANCELLED" && actorType === "CUSTOMER") {
    return onCustomerCancelled(orderId)
  }
  return onCustomerFacingStatus(orderId, toStatus)
}

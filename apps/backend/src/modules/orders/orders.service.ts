import { createHash } from "node:crypto"
import { prisma } from "../../db/prisma.js"
import {
  ActorType,
  CouponScope,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  type Unit,
} from "../../generated/prisma/enums.js"
import { events } from "../../lib/events.js"
import {
  CartChangedError,
  ConflictError,
  InvalidTransitionError,
  NotFoundError,
  OutOfServiceAreaError,
  StoreClosedError,
  ValidationError,
} from "../../lib/errors.js"
import { logger } from "../../lib/logger.js"
import { effectivePricePaise } from "../../lib/pricing.js"
import { computeCouponDiscountPaise } from "../coupons/coupons.service.js"
import type {
  ListOrdersQuery,
  OwnerListOrdersQuery,
  PlaceOrderBody,
} from "./orders.schemas.js"

const IDEMPOTENCY_SCOPE = "orders"
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

// --- View shape ---------------------------------------------------------

export interface OrderItemView {
  id: string
  productId: string | null
  nameSnapshot: string
  imageUrlSnapshot: string | null
  unitPricePaiseSnapshot: number
  unitSnapshot: Unit
  quantity: number
  lineTotalPaise: number
}

export interface OrderView {
  id: string
  status: OrderStatus
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  itemsSubtotalPaise: number
  discountPaise: number
  deliveryFeePaise: number
  totalPaise: number
  couponCode: string | null
  store: { id: string; nameSnapshot: string; phoneSnapshot: string }
  customer: { nameSnapshot: string; phoneSnapshot: string }
  delivery: {
    label: string
    line1: string
    line2: string | null
    city: string
    pincode: string
    latitude: string
    longitude: string
  }
  customerNote: string | null
  items: OrderItemView[]
  placedAt: string
  createdAt: string
  // Phase 8 — lifecycle timestamps + reasons (null until reached).
  acceptedAt: string | null
  outForDeliveryAt: string | null
  deliveredAt: string | null
  rejectedAt: string | null
  cancelledAt: string | null
  rejectionReason: string | null
  cancellationReason: string | null
}

const ORDER_SELECT = {
  id: true,
  storeId: true,
  customerId: true,
  status: true,
  paymentMethod: true,
  paymentStatus: true,
  itemsSubtotalPaise: true,
  deliveryFeePaise: true,
  totalPaise: true,
  storeNameSnapshot: true,
  storePhoneSnapshot: true,
  customerNameSnapshot: true,
  customerPhoneSnapshot: true,
  deliveryLabel: true,
  deliveryLine1: true,
  deliveryLine2: true,
  deliveryCity: true,
  deliveryPincode: true,
  deliveryLatitude: true,
  deliveryLongitude: true,
  customerNote: true,
  placedAt: true,
  createdAt: true,
  acceptedAt: true,
  outForDeliveryAt: true,
  deliveredAt: true,
  rejectedAt: true,
  cancelledAt: true,
  rejectionReason: true,
  cancellationReason: true,
  items: {
    select: {
      id: true,
      productId: true,
      productNameSnapshot: true,
      productImageUrlSnapshot: true,
      unitPricePaiseSnapshot: true,
      unitSnapshot: true,
      quantity: true,
      lineTotalPaise: true,
    },
    orderBy: { createdAt: "asc" },
  },
  couponRedemption: {
    select: { discountAppliedPaise: true, coupon: { select: { code: true } } },
  },
} as const

type OrderRow = {
  id: string
  storeId: string
  customerId: string
  status: OrderStatus
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  itemsSubtotalPaise: number
  deliveryFeePaise: number
  totalPaise: number
  storeNameSnapshot: string
  storePhoneSnapshot: string
  customerNameSnapshot: string
  customerPhoneSnapshot: string
  deliveryLabel: string
  deliveryLine1: string
  deliveryLine2: string | null
  deliveryCity: string
  deliveryPincode: string
  deliveryLatitude: unknown
  deliveryLongitude: unknown
  customerNote: string | null
  placedAt: Date
  createdAt: Date
  acceptedAt: Date | null
  outForDeliveryAt: Date | null
  deliveredAt: Date | null
  rejectedAt: Date | null
  cancelledAt: Date | null
  rejectionReason: string | null
  cancellationReason: string | null
  items: Array<{
    id: string
    productId: string | null
    productNameSnapshot: string
    productImageUrlSnapshot: string | null
    unitPricePaiseSnapshot: number
    unitSnapshot: Unit
    quantity: number
    lineTotalPaise: number
  }>
  couponRedemption: { discountAppliedPaise: number; coupon: { code: string } } | null
}

function toOrderView(row: OrderRow): OrderView {
  return {
    id: row.id,
    status: row.status,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    itemsSubtotalPaise: row.itemsSubtotalPaise,
    discountPaise: row.couponRedemption?.discountAppliedPaise ?? 0,
    deliveryFeePaise: row.deliveryFeePaise,
    totalPaise: row.totalPaise,
    couponCode: row.couponRedemption?.coupon.code ?? null,
    store: {
      id: row.storeId,
      nameSnapshot: row.storeNameSnapshot,
      phoneSnapshot: row.storePhoneSnapshot,
    },
    customer: {
      nameSnapshot: row.customerNameSnapshot,
      phoneSnapshot: row.customerPhoneSnapshot,
    },
    delivery: {
      label: row.deliveryLabel,
      line1: row.deliveryLine1,
      line2: row.deliveryLine2,
      city: row.deliveryCity,
      pincode: row.deliveryPincode,
      latitude: String(row.deliveryLatitude),
      longitude: String(row.deliveryLongitude),
    },
    customerNote: row.customerNote,
    items: row.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      nameSnapshot: i.productNameSnapshot,
      imageUrlSnapshot: i.productImageUrlSnapshot,
      unitPricePaiseSnapshot: i.unitPricePaiseSnapshot,
      unitSnapshot: i.unitSnapshot,
      quantity: i.quantity,
      lineTotalPaise: i.lineTotalPaise,
    })),
    placedAt: row.placedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    outForDeliveryAt: row.outForDeliveryAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    cancellationReason: row.cancellationReason,
  }
}

// --- Idempotency helpers ------------------------------------------------

/** Deterministic fingerprint of the request body (key order doesn't matter). */
function fingerprintBody(body: PlaceOrderBody): string {
  return createHash("sha256").update(stableStringify(body)).digest("hex")
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  )
}

// --- Placement ----------------------------------------------------------

export async function placeOrder(
  userId: string,
  idempotencyKey: string,
  body: PlaceOrderBody,
): Promise<{ order: OrderView; replayed: boolean }> {
  const fingerprint = fingerprintBody(body)

  // Fast path: a completed prior attempt with this key.
  const prior = await prisma.idempotencyKey.findUnique({
    where: { userId_scope_key: { userId, scope: IDEMPOTENCY_SCOPE, key: idempotencyKey } },
  })
  if (prior !== null) {
    if (prior.requestFingerprint !== fingerprint) {
      throw new ConflictError("Idempotency-Key was reused with a different request")
    }
    if (prior.responseStatusCode > 0) {
      return { order: prior.responseBody as unknown as OrderView, replayed: true }
    }
    throw new ConflictError("A request with this Idempotency-Key is still being processed")
  }

  try {
    const view = await prisma.$transaction(async (tx) => {
      // Claim the key first — the @@unique([userId, scope, key]) makes this the
      // concurrency guard: a simultaneous duplicate throws P2002 here.
      await tx.idempotencyKey.create({
        data: {
          userId,
          scope: IDEMPOTENCY_SCOPE,
          key: idempotencyKey,
          requestFingerprint: fingerprint,
          responseStatusCode: 0,
          responseBody: {},
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        },
      })

      // 1. Delivery address (must belong to the caller).
      const address = await tx.address.findFirst({
        where: { id: body.addressId, customerId: userId },
        select: {
          label: true,
          line1: true,
          line2: true,
          city: true,
          pincode: true,
          latitude: true,
          longitude: true,
        },
      })
      if (address === null) throw new NotFoundError("Delivery address not found")

      // 2. Customer snapshot.
      const customer = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true, phone: true },
      })

      // 3. Re-read every product; reject if any vanished / went unavailable.
      const products = await tx.product.findMany({
        where: { id: { in: body.cart.map((i) => i.productId) }, isActive: true },
        select: {
          id: true,
          storeId: true,
          name: true,
          imageUrl: true,
          unit: true,
          pricePaise: true,
          discountType: true,
          discountValue: true,
          discountValidUntil: true,
          isAvailable: true,
          subcategory: { select: { isAvailable: true } },
        },
      })
      const byId = new Map(products.map((p) => [p.id, p]))
      const changed = body.cart
        .filter((item) => {
          const p = byId.get(item.productId)
          return p === undefined || !p.isAvailable || !p.subcategory.isAvailable
        })
        .map((item) => item.productId)
      if (changed.length > 0) {
        throw new CartChangedError("Some items are no longer available", {
          products: changed,
        })
      }

      // 4. Single-store cart.
      const storeIds = new Set(products.map((p) => p.storeId))
      if (storeIds.size > 1) {
        throw new ValidationError("Cart spans multiple stores")
      }
      const storeId = [...storeIds][0] as string

      // 5. Store must be active + open.
      const store = await tx.store.findFirst({
        where: { id: storeId, isActive: true },
        select: {
          name: true,
          phone: true,
          isOpen: true,
          minOrderPaise: true,
          deliveryRadiusMeters: true,
        },
      })
      if (store === null) throw new NotFoundError("Store not found")
      if (!store.isOpen) throw new StoreClosedError()

      // 6. Subtotal from effective (discounted) prices + line snapshots.
      let itemsSubtotalPaise = 0
      const itemRows = body.cart.map((item) => {
        const p = byId.get(item.productId) as NonNullable<ReturnType<typeof byId.get>>
        const unit = effectivePricePaise(p)
        const lineTotalPaise = unit * item.quantity
        itemsSubtotalPaise += lineTotalPaise
        return {
          productId: p.id,
          productNameSnapshot: p.name,
          productImageUrlSnapshot: p.imageUrl,
          unitPricePaiseSnapshot: unit,
          unitSnapshot: p.unit,
          quantity: item.quantity,
          lineTotalPaise,
        }
      })

      // 7. Minimum order.
      if (itemsSubtotalPaise < store.minOrderPaise) {
        throw new CartChangedError("Order is below the store's minimum", {
          minOrderPaise: store.minOrderPaise,
        })
      }

      // 8. Service area — delivery point within the store's radius.
      const lat = Number(address.latitude)
      const lng = Number(address.longitude)
      const area = await tx.$queryRaw<{ within: boolean }[]>`
        SELECT ST_DWithin(
          s.location,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
          ${store.deliveryRadiusMeters}::float8
        ) AS within
        FROM "Store" s WHERE s.id = ${storeId}`
      if (area[0]?.within !== true) throw new OutOfServiceAreaError()

      // 9. Coupon (optional). Re-validate against the recomputed subtotal.
      let discountPaise = 0
      let couponId: string | null = null
      let couponTotalUsageLimit: number | null = null
      if (body.couponCode !== undefined) {
        const coupon = await tx.coupon.findUnique({
          where: { code: body.couponCode },
          select: {
            id: true,
            type: true,
            value: true,
            scope: true,
            storeId: true,
            maxDiscountPaise: true,
            minOrderPaise: true,
            validFrom: true,
            validUntil: true,
            isActive: true,
            totalUsageLimit: true,
            perUserLimit: true,
            usageCount: true,
          },
        })
        const now = new Date()
        const lifecycleBad =
          coupon === null ||
          !coupon.isActive ||
          coupon.validFrom.getTime() > now.getTime() ||
          (coupon.validUntil !== null && coupon.validUntil.getTime() <= now.getTime()) ||
          (coupon.totalUsageLimit !== null && coupon.usageCount >= coupon.totalUsageLimit) ||
          (coupon.scope === CouponScope.STORE && coupon.storeId !== storeId)
        if (lifecycleBad) {
          throw new ConflictError("Coupon is no longer valid — re-check before placing")
        }
        if (coupon.perUserLimit > 0) {
          const used = await tx.couponRedemption.count({
            where: { couponId: coupon.id, userId },
          })
          if (used >= coupon.perUserLimit) {
            throw new ConflictError("You have already used this coupon")
          }
        }
        if (itemsSubtotalPaise < coupon.minOrderPaise) {
          throw new CartChangedError("Coupon minimum order not met", {
            minOrderPaise: coupon.minOrderPaise,
          })
        }
        discountPaise = computeCouponDiscountPaise({
          type: coupon.type,
          value: coupon.value,
          maxDiscountPaise: coupon.maxDiscountPaise,
          subtotalPaise: itemsSubtotalPaise,
        })
        couponId = coupon.id
        couponTotalUsageLimit = coupon.totalUsageLimit
      }

      const deliveryFeePaise = 0
      const totalPaise = itemsSubtotalPaise - discountPaise + deliveryFeePaise

      // 10. Create the order + items + initial status-history entry.
      const created = await tx.order.create({
        data: {
          customerId: userId,
          storeId,
          status: OrderStatus.PLACED,
          paymentMethod: PaymentMethod.COD,
          paymentStatus: PaymentStatus.PENDING,
          itemsSubtotalPaise,
          deliveryFeePaise,
          totalPaise,
          storeNameSnapshot: store.name,
          storePhoneSnapshot: store.phone,
          customerNameSnapshot: customer.name,
          customerPhoneSnapshot: customer.phone,
          deliveryLabel: address.label,
          deliveryLine1: address.line1,
          deliveryLine2: address.line2,
          deliveryCity: address.city,
          deliveryPincode: address.pincode,
          deliveryLatitude: address.latitude,
          deliveryLongitude: address.longitude,
          customerNote: body.customerNote ?? null,
          placedAt: new Date(),
          items: { create: itemRows },
          history: {
            create: {
              fromStatus: null,
              toStatus: OrderStatus.PLACED,
              actorType: ActorType.CUSTOMER,
              actorUserId: userId,
            },
          },
        },
        select: { id: true },
      })

      // 11. Coupon redemption + guarded usage increment.
      if (couponId !== null) {
        await tx.couponRedemption.create({
          data: {
            couponId,
            userId,
            orderId: created.id,
            discountAppliedPaise: discountPaise,
          },
        })
        // The original coupon read gave the limit; the conditional updateMany
        // makes the increment safe under concurrency (0 rows = just exhausted).
        const bump = await tx.coupon.updateMany({
          where:
            couponTotalUsageLimit === null
              ? { id: couponId }
              : { id: couponId, usageCount: { lt: couponTotalUsageLimit } },
          data: { usageCount: { increment: 1 } },
        })
        if (bump.count === 0) {
          throw new ConflictError("Coupon just reached its usage limit")
        }
      }

      // 12. Materialise the response + persist it on the idempotency row.
      const full = await tx.order.findUniqueOrThrow({
        where: { id: created.id },
        select: ORDER_SELECT,
      })
      const orderView = toOrderView(full)
      await tx.idempotencyKey.update({
        where: {
          userId_scope_key: { userId, scope: IDEMPOTENCY_SCOPE, key: idempotencyKey },
        },
        data: {
          responseStatusCode: 201,
          responseBody: orderView as unknown as object,
          orderId: created.id,
        },
      })
      return orderView
      // Generous timeout: placement makes ~10 sequential round-trips to Neon,
      // which can exceed Prisma's 5s interactive-transaction default under
      // latency. maxWait covers waiting for a pooled connection.
    }, { maxWait: 10_000, timeout: 20_000 })

    events.emit({
      type: "order.placed",
      orderId: view.id,
      storeId: view.store.id,
      customerId: userId,
      totalPaise: view.totalPaise,
    })
    return { order: view, replayed: false }
  } catch (err) {
    // A concurrent request claimed the same key between our fast-path read and
    // the create. Return its result (or signal in-progress).
    if (isUniqueViolation(err)) {
      const row = await prisma.idempotencyKey.findUnique({
        where: { userId_scope_key: { userId, scope: IDEMPOTENCY_SCOPE, key: idempotencyKey } },
      })
      if (row !== null && row.responseStatusCode > 0) {
        return { order: row.responseBody as unknown as OrderView, replayed: true }
      }
      throw new ConflictError("A concurrent request with this Idempotency-Key is being processed")
    }
    throw err
  }
}

// --- Reads --------------------------------------------------------------

interface OrderListResult {
  items: OrderView[]
  nextCursor: string | null
  hasMore: boolean
}

export async function listCustomerOrders(
  customerId: string,
  query: ListOrdersQuery,
): Promise<OrderListResult> {
  return listOrders(
    {
      customerId,
      ...(query.storeId !== undefined ? { storeId: query.storeId } : {}),
    },
    query.cursor,
    query.limit,
  )
}

export async function getCustomerOrder(
  customerId: string,
  orderId: string,
): Promise<OrderView> {
  const row = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    select: ORDER_SELECT,
  })
  if (row === null) throw new NotFoundError("Order not found")
  return toOrderView(row)
}

export async function listStoreOrders(
  storeId: string,
  query: OwnerListOrdersQuery,
): Promise<OrderListResult> {
  return listOrders(
    { storeId, ...(query.status !== undefined ? { status: query.status } : {}) },
    query.cursor,
    query.limit,
  )
}

export async function getStoreOrder(storeId: string, orderId: string): Promise<OrderView> {
  const row = await prisma.order.findFirst({
    where: { id: orderId, storeId },
    select: ORDER_SELECT,
  })
  if (row === null) throw new NotFoundError("Order not found")
  return toOrderView(row)
}

async function listOrders(
  where: { customerId?: string; storeId?: string; status?: OrderStatus },
  cursor: string | undefined,
  limit: number,
): Promise<OrderListResult> {
  const rows = await prisma.order.findMany({
    where,
    select: ORDER_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  const hasMore = rows.length > limit
  const trimmed = hasMore ? rows.slice(0, limit) : rows
  return {
    items: trimmed.map(toOrderView),
    nextCursor: hasMore ? (trimmed[trimmed.length - 1]?.id ?? null) : null,
    hasMore,
  }
}

// --- Lifecycle transitions (Phase 8) ------------------------------------

type Scope = { storeId: string } | { customerId: string }

/**
 * Atomic, double-tap-safe status transition. The guarded updateMany (WHERE
 * includes the expected `from` status + the ownership scope) is the whole
 * concurrency story: 0 rows means the order is either not owned/found or not
 * in the expected state — a follow-up read disambiguates 404 vs 409. Writes a
 * history row and emits order.status_changed.
 */
async function transition(opts: {
  orderId: string
  scope: Scope
  from: OrderStatus
  to: OrderStatus
  actorType: ActorType
  actorUserId: string
  patch: Record<string, unknown>
  reason?: string | null
}): Promise<OrderView> {
  const row = await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: opts.orderId, status: opts.from, ...opts.scope },
      data: { status: opts.to, ...opts.patch },
    })
    if (claimed.count === 0) {
      const exists = await tx.order.findFirst({
        where: { id: opts.orderId, ...opts.scope },
        select: { id: true },
      })
      if (exists === null) throw new NotFoundError("Order not found")
      throw new InvalidTransitionError()
    }
    await tx.orderStatusHistory.create({
      data: {
        orderId: opts.orderId,
        fromStatus: opts.from,
        toStatus: opts.to,
        actorType: opts.actorType,
        actorUserId: opts.actorUserId,
        reason: opts.reason ?? null,
      },
    })
    return tx.order.findUniqueOrThrow({ where: { id: opts.orderId }, select: ORDER_SELECT })
  })

  const view = toOrderView(row)
  events.emit({
    type: "order.status_changed",
    orderId: row.id,
    storeId: row.storeId,
    customerId: row.customerId,
    fromStatus: opts.from,
    toStatus: opts.to,
    actorType: opts.actorType,
  })
  return view
}

// Owner-driven transitions (scoped to the owner's store).

export function acceptOrder(storeId: string, ownerId: string, orderId: string): Promise<OrderView> {
  return transition({
    orderId,
    scope: { storeId },
    from: OrderStatus.PLACED,
    to: OrderStatus.ACCEPTED,
    actorType: ActorType.OWNER,
    actorUserId: ownerId,
    patch: { acceptedAt: new Date() },
  })
}

export function rejectOrder(
  storeId: string,
  ownerId: string,
  orderId: string,
  reason: string,
): Promise<OrderView> {
  return transition({
    orderId,
    scope: { storeId },
    from: OrderStatus.PLACED,
    to: OrderStatus.REJECTED,
    actorType: ActorType.OWNER,
    actorUserId: ownerId,
    patch: { rejectedAt: new Date(), rejectionReason: reason },
    reason,
  })
}

export function markOutForDelivery(
  storeId: string,
  ownerId: string,
  orderId: string,
): Promise<OrderView> {
  return transition({
    orderId,
    scope: { storeId },
    from: OrderStatus.ACCEPTED,
    to: OrderStatus.OUT_FOR_DELIVERY,
    actorType: ActorType.OWNER,
    actorUserId: ownerId,
    patch: { outForDeliveryAt: new Date() },
  })
}

export function markDelivered(
  storeId: string,
  ownerId: string,
  orderId: string,
): Promise<OrderView> {
  return transition({
    orderId,
    scope: { storeId },
    from: OrderStatus.OUT_FOR_DELIVERY,
    to: OrderStatus.DELIVERED,
    actorType: ActorType.OWNER,
    actorUserId: ownerId,
    // COD collected at the door.
    patch: { deliveredAt: new Date(), paymentStatus: PaymentStatus.COLLECTED },
  })
}

// Customer cancel — only while still PLACED.

export function cancelOrder(
  customerId: string,
  orderId: string,
  reason: string | undefined,
): Promise<OrderView> {
  return transition({
    orderId,
    scope: { customerId },
    from: OrderStatus.PLACED,
    to: OrderStatus.CANCELLED,
    actorType: ActorType.CUSTOMER,
    actorUserId: customerId,
    patch: { cancelledAt: new Date(), cancellationReason: reason ?? null },
    reason: reason ?? null,
  })
}

const AUTO_CANCEL_REASON = "Auto-cancelled — the store didn't accept in time"

/**
 * Phase 11 cron — cancel orders left in PLACED past the cutoff (the store never
 * accepted). SYSTEM actor; per-order guarded update so it can't race an owner
 * accept / customer cancel, with a history row + order.status_changed emit
 * (which notifies the customer). Bounded per run; returns how many it cancelled.
 */
export async function autoCancelStalePlacedOrders(
  olderThan: Date,
  limit = 200,
): Promise<number> {
  const stale = await prisma.order.findMany({
    where: { status: OrderStatus.PLACED, placedAt: { lt: olderThan } },
    select: { id: true },
    take: limit,
  })

  let cancelled = 0
  for (const { id } of stale) {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: { id, status: OrderStatus.PLACED },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt: new Date(),
            cancellationReason: AUTO_CANCEL_REASON,
          },
        })
        if (claimed.count === 0) return null // raced — owner accepted / customer cancelled
        await tx.orderStatusHistory.create({
          data: {
            orderId: id,
            fromStatus: OrderStatus.PLACED,
            toStatus: OrderStatus.CANCELLED,
            actorType: ActorType.SYSTEM,
            actorUserId: null,
            reason: AUTO_CANCEL_REASON,
          },
        })
        return tx.order.findUniqueOrThrow({ where: { id }, select: ORDER_SELECT })
      })
      if (row === null) continue
      events.emit({
        type: "order.status_changed",
        orderId: row.id,
        storeId: row.storeId,
        customerId: row.customerId,
        fromStatus: OrderStatus.PLACED,
        toStatus: OrderStatus.CANCELLED,
        actorType: ActorType.SYSTEM,
      })
      cancelled++
    } catch (err) {
      logger.warn({ err, orderId: id }, "auto-cancel: failed for one order")
    }
  }
  return cancelled
}

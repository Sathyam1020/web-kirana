import { prisma } from "../../db/prisma.js"
import { events } from "../../lib/events.js"
import {
  MaxAddressesReachedError,
  NotFoundError,
} from "../../lib/errors.js"
import { rethrowAsAppError } from "../../lib/prisma-errors.js"
import type {
  CreateAddressBody,
  UpdateAddressBody,
} from "./addresses.schemas.js"

/**
 * Phase 6 — Customer address book.
 *
 * Authz pattern: every read / update / delete narrows by
 * `WHERE id AND customerId` so customer A can never touch B's row even
 * with a guessed id. 404 (not 403) on miss to keep address ids opaque.
 */

export interface AddressView {
  id: string
  label: string
  line1: string
  line2: string | null
  city: string
  pincode: string
  latitude: string
  longitude: string
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

const SELECT = {
  id: true,
  label: true,
  line1: true,
  line2: true,
  city: true,
  pincode: true,
  latitude: true,
  longitude: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const

/** Bounded address book — see PROGRESS.md Phase 6 notes. */
const MAX_ADDRESSES_PER_CUSTOMER = 20

function toView(row: {
  id: string
  label: string
  line1: string
  line2: string | null
  city: string
  pincode: string
  latitude: unknown
  longitude: unknown
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}): AddressView {
  return {
    ...row,
    latitude: String(row.latitude),
    longitude: String(row.longitude),
  }
}

export async function createAddress(
  customerId: string,
  input: CreateAddressBody,
): Promise<AddressView> {
  // Cap-and-default both need a count first; do them in one query.
  const existingCount = await prisma.address.count({ where: { customerId } })
  if (existingCount >= MAX_ADDRESSES_PER_CUSTOMER) {
    throw new MaxAddressesReachedError()
  }

  // First address is auto-default regardless of input — avoids the
  // "added an address but checkout says no default" trap.
  const wantsDefault = existingCount === 0 || input.isDefault === true

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (wantsDefault) {
        // Clear any other default first; the partial unique index
        // (Address_one_default_per_customer) would otherwise reject the
        // INSERT if a row already has isDefault=true.
        await tx.address.updateMany({
          where: { customerId, isDefault: true },
          data: { isDefault: false },
        })
      }
      return tx.address.create({
        data: {
          customerId,
          label: input.label,
          line1: input.line1,
          line2: input.line2 ?? null,
          city: input.city,
          pincode: input.pincode,
          latitude: input.latitude.toString(),
          longitude: input.longitude.toString(),
          isDefault: wantsDefault,
        },
        select: SELECT,
      })
    })
    events.emit({
      type: "address.created",
      addressId: created.id,
      customerId,
    })
    return toView(created)
  } catch (err) {
    rethrowAsAppError(err)
  }
}

export async function listAddresses(customerId: string): Promise<AddressView[]> {
  const rows = await prisma.address.findMany({
    where: { customerId },
    select: SELECT,
    // Default first so the customer PWA renders the chosen one on top of
    // the address picker. Tie-break by createdAt DESC then id DESC for
    // deterministic order across renders.
    orderBy: [
      { isDefault: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
  })
  return rows.map(toView)
}

export async function getAddress(
  customerId: string,
  addressId: string,
): Promise<AddressView> {
  const row = await prisma.address.findFirst({
    where: { id: addressId, customerId },
    select: SELECT,
  })
  if (row === null) throw new NotFoundError("Address not found")
  return toView(row)
}

export async function updateAddress(
  customerId: string,
  addressId: string,
  input: UpdateAddressBody,
): Promise<AddressView> {
  const data: Record<string, unknown> = {}
  if (input.label !== undefined) data.label = input.label
  if (input.line1 !== undefined) data.line1 = input.line1
  if (input.line2 !== undefined) data.line2 = input.line2
  if (input.city !== undefined) data.city = input.city
  if (input.pincode !== undefined) data.pincode = input.pincode
  if (input.latitude !== undefined) data.latitude = input.latitude.toString()
  if (input.longitude !== undefined) data.longitude = input.longitude.toString()

  if (Object.keys(data).length === 0) {
    return getAddress(customerId, addressId)
  }

  const claim = await prisma.address.updateMany({
    where: { id: addressId, customerId },
    data,
  })
  if (claim.count === 0) throw new NotFoundError("Address not found")

  const updated = await prisma.address.findUniqueOrThrow({
    where: { id: addressId },
    select: SELECT,
  })
  events.emit({
    type: "address.updated",
    addressId,
    customerId,
    fields: Object.keys(data),
  })
  return toView(updated)
}

/**
 * Hard delete. If the deleted row was the default and the customer still
 * has other addresses, promote the most-recently-created one to default
 * inside the same transaction so the customer never ends up with rows
 * but no default.
 */
export async function deleteAddress(
  customerId: string,
  addressId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({
      where: { id: addressId, customerId },
      select: { id: true, isDefault: true },
    })
    if (existing === null) throw new NotFoundError("Address not found")

    await tx.address.delete({ where: { id: addressId } })

    if (existing.isDefault) {
      // Promote next-newest sibling so the customer always has a default
      // (when at least one address still exists).
      const next = await tx.address.findFirst({
        where: { customerId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      })
      if (next !== null) {
        await tx.address.update({
          where: { id: next.id },
          data: { isDefault: true },
        })
      }
    }
  })
  events.emit({ type: "address.deleted", addressId, customerId })
}

/**
 * Atomic flip: clear the customer's current default, set this address as
 * default. Idempotent — if the target is already the default we return it
 * unchanged. The partial unique index makes a concurrent flip a hard 409
 * rather than silently leaving two defaults.
 */
export async function setDefaultAddress(
  customerId: string,
  addressId: string,
): Promise<AddressView> {
  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.address.findFirst({
      where: { id: addressId, customerId },
      select: { id: true, isDefault: true },
    })
    if (target === null) throw new NotFoundError("Address not found")

    if (target.isDefault) {
      // Already default — no-op, return the row as-is.
      return tx.address.findUniqueOrThrow({
        where: { id: addressId },
        select: SELECT,
      })
    }

    await tx.address.updateMany({
      where: { customerId, isDefault: true },
      data: { isDefault: false },
    })
    return tx.address.update({
      where: { id: addressId },
      data: { isDefault: true },
      select: SELECT,
    })
  })
  events.emit({
    type: "address.default_changed",
    addressId,
    customerId,
  })
  return toView(result)
}

/**
 * Phase 7 will call this from inside the order-placement transaction to
 * read + snapshot the customer's chosen delivery address. Exported here
 * so the orders service can compose it without a circular import.
 */
export async function findAddressByIdInternal(
  customerId: string,
  addressId: string,
): Promise<AddressView | null> {
  const row = await prisma.address.findFirst({
    where: { id: addressId, customerId },
    select: SELECT,
  })
  return row === null ? null : toView(row)
}

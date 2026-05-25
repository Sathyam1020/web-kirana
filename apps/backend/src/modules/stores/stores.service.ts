import { prisma } from "../../db/prisma.js"
import { events } from "../../lib/events.js"
import { ConflictError, StoreNotCreatedError } from "../../lib/errors.js"
import { normalizePhone } from "../../lib/phone.js"
import { rethrowAsAppError } from "../../lib/prisma-errors.js"
import type { CreateStoreBody, UpdateStoreBody } from "./stores.schemas.js"

/**
 * Service-layer view shape. Latitude/longitude come back as strings (Prisma
 * Decimal serializes that way) — clients parseFloat as needed.
 */
export interface StoreView {
  id: string
  ownerId: string
  name: string
  description: string | null
  phone: string
  isActive: boolean
  isOpen: boolean
  latitude: string
  longitude: string
  deliveryRadiusMeters: number
  minOrderPaise: number
  addressLine: string
  city: string
  pincode: string
  imageUrl: string | null
  createdAt: Date
  updatedAt: Date
}

const SELECT = {
  id: true,
  ownerId: true,
  name: true,
  description: true,
  phone: true,
  isActive: true,
  isOpen: true,
  latitude: true,
  longitude: true,
  deliveryRadiusMeters: true,
  minOrderPaise: true,
  addressLine: true,
  city: true,
  pincode: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true,
} as const

function toView(row: {
  id: string
  ownerId: string
  name: string
  description: string | null
  phone: string
  isActive: boolean
  isOpen: boolean
  latitude: unknown
  longitude: unknown
  deliveryRadiusMeters: number
  minOrderPaise: number
  addressLine: string
  city: string
  pincode: string
  imageUrl: string | null
  createdAt: Date
  updatedAt: Date
}): StoreView {
  return {
    ...row,
    latitude: String(row.latitude),
    longitude: String(row.longitude),
  }
}

export async function createOwnStore(
  ownerId: string,
  input: CreateStoreBody,
): Promise<StoreView> {
  const existing = await prisma.store.findUnique({
    where: { ownerId },
    select: { id: true },
  })
  if (existing !== null) {
    throw new ConflictError("You already have a store")
  }

  try {
    const created = await prisma.store.create({
      data: {
        ownerId,
        name: input.name,
        description: input.description,
        phone: normalizePhone(input.phone),
        latitude: input.latitude.toString(),
        longitude: input.longitude.toString(),
        deliveryRadiusMeters: input.deliveryRadiusMeters,
        minOrderPaise: input.minOrderPaise,
        addressLine: input.addressLine,
        city: input.city,
        pincode: input.pincode,
        imageUrl: input.imageUrl,
        // isOpen defaults to false in the schema — new stores require an
        // explicit open before they appear in /stores/nearby.
      },
      select: SELECT,
    })
    events.emit({ type: "store.created", storeId: created.id, ownerId })
    return toView(created)
  } catch (err) {
    rethrowAsAppError(err)
  }
}

export async function getOwnStore(ownerId: string): Promise<StoreView> {
  const row = await prisma.store.findUnique({
    where: { ownerId },
    select: SELECT,
  })
  if (row === null) throw new StoreNotCreatedError()
  return toView(row)
}

export async function updateOwnStore(
  ownerId: string,
  input: UpdateStoreBody,
): Promise<StoreView> {
  // Build the data object explicitly. `null` clears optional string fields;
  // `undefined` means "don't touch".
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  if (input.phone !== undefined) data.phone = normalizePhone(input.phone)
  if (input.latitude !== undefined) data.latitude = input.latitude.toString()
  if (input.longitude !== undefined) data.longitude = input.longitude.toString()
  if (input.deliveryRadiusMeters !== undefined) data.deliveryRadiusMeters = input.deliveryRadiusMeters
  if (input.minOrderPaise !== undefined) data.minOrderPaise = input.minOrderPaise
  if (input.addressLine !== undefined) data.addressLine = input.addressLine
  if (input.city !== undefined) data.city = input.city
  if (input.pincode !== undefined) data.pincode = input.pincode
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl

  if (Object.keys(data).length === 0) {
    return getOwnStore(ownerId)
  }

  const claim = await prisma.store.updateMany({
    where: { ownerId },
    data,
  })
  if (claim.count === 0) throw new StoreNotCreatedError()

  const updated = await prisma.store.findUniqueOrThrow({
    where: { ownerId },
    select: SELECT,
  })
  events.emit({
    type: "store.updated",
    storeId: updated.id,
    ownerId,
    fields: Object.keys(data),
  })
  return toView(updated)
}

export async function toggleOpen(
  ownerId: string,
  isOpen: boolean,
): Promise<StoreView> {
  const claim = await prisma.store.updateMany({
    where: { ownerId },
    data: { isOpen },
  })
  if (claim.count === 0) throw new StoreNotCreatedError()

  const updated = await prisma.store.findUniqueOrThrow({
    where: { ownerId },
    select: SELECT,
  })
  events.emit({
    type: isOpen ? "store.opened" : "store.closed",
    storeId: updated.id,
    ownerId,
  })
  return toView(updated)
}

/**
 * Internal helper used by Phase 5 (discovery) and Phase 7 (order placement)
 * later. Not exported via the public API.
 */
export async function findStoreByIdInternal(storeId: string): Promise<StoreView | null> {
  const row = await prisma.store.findUnique({
    where: { id: storeId },
    select: SELECT,
  })
  return row === null ? null : toView(row)
}


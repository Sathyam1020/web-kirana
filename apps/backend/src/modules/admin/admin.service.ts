import { prisma } from "../../db/prisma.js"
import { Role } from "../../generated/prisma/enums.js"
import { ConflictError, NotFoundError } from "../../lib/errors.js"

interface PendingOwnerRow {
  id: string
  phone: string
  name: string
  createdAt: Date
}

export async function listPendingOwners(): Promise<PendingOwnerRow[]> {
  return prisma.user.findMany({
    where: { role: Role.OWNER, isApproved: false },
    select: { id: true, phone: true, name: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })
}

export interface ApprovedOwnerView {
  id: string
  phone: string
  name: string
  isApproved: boolean
  approvedAt: Date | null
  approvedById: string | null
}

export async function approveOwner(opts: {
  ownerId: string
  approverId: string
}): Promise<ApprovedOwnerView> {
  // Optimistic claim: only flip when still PENDING. Concurrent approvals
  // produce one transition; the loser sees count = 0 and we 409.
  const claim = await prisma.user.updateMany({
    where: { id: opts.ownerId, role: Role.OWNER, isApproved: false },
    data: {
      isApproved: true,
      approvedAt: new Date(),
      approvedById: opts.approverId,
    },
  })

  if (claim.count === 0) {
    const row = await prisma.user.findUnique({
      where: { id: opts.ownerId },
      select: { id: true, role: true, isApproved: true },
    })
    if (row === null || row.role !== Role.OWNER) {
      throw new NotFoundError("Pending owner not found")
    }
    throw new ConflictError("Owner has already been approved")
  }

  const updated = await prisma.user.findUniqueOrThrow({
    where: { id: opts.ownerId },
    select: { id: true, phone: true, name: true, isApproved: true, approvedAt: true, approvedById: true },
  })
  return updated
}

/**
 * Rejecting a pending owner hard-deletes the user row. Better-auth Session
 * + Account rows cascade off User (onDelete: Cascade), so any live sessions
 * vanish with the user — no explicit revoke needed. The build prompt doesn't
 * mandate retaining rejected accounts; an audit table will land if/when the
 * admin UI grows a history view in a later phase.
 */
export async function rejectOwner(opts: { ownerId: string }): Promise<void> {
  const result = await prisma.user.deleteMany({
    where: { id: opts.ownerId, role: Role.OWNER, isApproved: false },
  })
  if (result.count === 0) {
    throw new NotFoundError("Pending owner not found")
  }
}

import { createHash, randomBytes, randomUUID } from "node:crypto"
import { env } from "../config/env.js"
import { prisma } from "../db/prisma.js"

/**
 * Refresh-token strategy:
 *
 *  - 32 random bytes encoded as base64url. 256 bits of entropy.
 *  - DB stores sha256(token) only (high-entropy → no per-token salt needed).
 *  - Every refresh issues a NEW token within the SAME `familyId`. The previous
 *    row's revokedAt is stamped and its parentId points to the previous link
 *    in the chain.
 *  - If a refresh comes in for a token that is already revoked, it's reuse —
 *    revoke EVERY row in the familyId. The user must re-login.
 *  - Logout revokes the chain explicitly.
 */

const TOKEN_BYTES = 32

export interface IssuedRefreshToken {
  /** The opaque value sent to the client (cookie / response). Show once, never store. */
  plaintext: string
  /** DB row id — useful as the parentId of the next rotation. */
  id: string
  /** Family id — shared by all rotations of the same login session. */
  familyId: string
  expiresAt: Date
}

function generatePlaintext(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url")
}

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex")
}

function expiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export async function issueForNewLogin(opts: {
  userId: string
  userAgent?: string
  ip?: string
}): Promise<IssuedRefreshToken> {
  const plaintext = generatePlaintext()
  const familyId = randomUUID()
  const expiresAt = expiry()
  const row = await prisma.refreshToken.create({
    data: {
      userId: opts.userId,
      tokenHash: hashToken(plaintext),
      familyId,
      expiresAt,
      userAgent: opts.userAgent,
      ip: opts.ip,
    },
  })
  return { plaintext, id: row.id, familyId, expiresAt }
}

export interface RefreshResult {
  ok: true
  userId: string
  token: IssuedRefreshToken
}

export interface RefreshFailure {
  ok: false
  /**
   *  - `not_found`: hash doesn't match any token. Generic 401.
   *  - `expired`: token is past expiresAt; chain not auto-revoked.
   *  - `reused`: token has been revoked already → chain revoked.
   */
  reason: "not_found" | "expired" | "reused"
}

/**
 * Atomic rotation. The whole thing runs inside a transaction; the only way two
 * concurrent rotations of the same plaintext don't both succeed is if the
 * "claim the parent" UPDATE is a single statement that filters on
 * `revokedAt IS NULL`. The loser drops out with count = 0 and triggers
 * family-wide revoke.
 *
 * Returns `ok: true` only when the parent was successfully claimed and the
 * child row was created in the same transaction.
 */
export async function rotate(opts: {
  plaintext: string
  userAgent?: string
  ip?: string
}): Promise<RefreshResult | RefreshFailure> {
  const tokenHash = hashToken(opts.plaintext)

  return prisma.$transaction(async (tx) => {
    // Single-statement atomic claim — only the first concurrent request that
    // finds revokedAt=null AND not-yet-expired wins.
    const claim = await tx.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    })

    if (claim.count === 0) {
      // No live parent matched. Distinguish causes for the right failure
      // reason (and so we can revoke the family on reuse).
      const probe = await tx.refreshToken.findUnique({
        where: { tokenHash },
        select: { id: true, familyId: true, revokedAt: true, expiresAt: true },
      })
      if (probe === null) {
        return { ok: false as const, reason: "not_found" as const }
      }
      if (probe.revokedAt === null && probe.expiresAt.getTime() <= Date.now()) {
        return { ok: false as const, reason: "expired" as const }
      }
      // Reuse: either already revoked, or we lost the race against another
      // concurrent rotation (the legitimate retry of a stolen token, or vice
      // versa). Revoke the whole family in the same transaction.
      await tx.refreshToken.updateMany({
        where: { familyId: probe.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      return { ok: false as const, reason: "reused" as const }
    }

    const parent = await tx.refreshToken.findUniqueOrThrow({
      where: { tokenHash },
      select: { id: true, familyId: true, userId: true },
    })

    const plaintext = generatePlaintext()
    const expiresAt = expiry()
    const child = await tx.refreshToken.create({
      data: {
        userId: parent.userId,
        tokenHash: hashToken(plaintext),
        familyId: parent.familyId,
        parentId: parent.id,
        expiresAt,
        userAgent: opts.userAgent,
        ip: opts.ip,
      },
    })

    return {
      ok: true as const,
      userId: parent.userId,
      token: {
        plaintext,
        id: child.id,
        familyId: parent.familyId,
        expiresAt,
      },
    }
  })
}

/** Revokes whatever token's hash matches plus its entire family. Idempotent. */
export async function revokeByPlaintext(plaintext: string): Promise<void> {
  const tokenHash = hashToken(plaintext)
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: { familyId: true },
  })
  if (existing === null) return
  await prisma.refreshToken.updateMany({
    where: { familyId: existing.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/** Revokes every live refresh token of a user. Used in admin/security ops. */
export async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

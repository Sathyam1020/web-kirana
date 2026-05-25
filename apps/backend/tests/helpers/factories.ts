/**
 * Test helpers: a per-run phone prefix so the shared DB seed survives, and
 * a `cleanup()` that nukes only what the run produced.
 *
 * Why phones not random ids: every Phase 3 flow keys off phone (unique
 * constraint + signup/login lookup), so prefixing them is the simplest way
 * to scope a run.
 */

import { randomInt } from "node:crypto"
import { prisma } from "../../src/db/prisma.js"

// 7-digit run id, e.g. "1234567" — pads up to a 14-15 char phone after we add
// `+9988` and a 3-digit user suffix. Never collides with seeded phones
// (+9999000000xx).
const RUN_ID = randomInt(1_000_000, 9_999_999).toString()
const PREFIX = `+9988${RUN_ID}`

let nextUserSuffix = 100
export function nextPhone(): string {
  const suffix = String(nextUserSuffix++).padStart(3, "0")
  return `${PREFIX}${suffix}`
}

export function isRunPhone(phone: string): boolean {
  return phone.startsWith(PREFIX)
}

/**
 * Removes all users created by THIS run. Refresh tokens, addresses, etc.
 * cascade. Safe to call from afterAll / afterEach.
 */
export async function cleanupRun(): Promise<void> {
  await prisma.user.deleteMany({
    where: { phone: { startsWith: PREFIX } },
  })
}

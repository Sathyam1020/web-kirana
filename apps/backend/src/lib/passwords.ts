import argon2 from "argon2"

/**
 * Argon2id parameters chosen for ~50–100ms on the target hardware. argon2's
 * own defaults were ARGON2I in older versions; argon2id is the OWASP
 * recommended variant — resistant to both side-channel and time-memory
 * trade-off attacks.
 *
 * Higher memoryCost makes brute-force harder; raise as servers get faster.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16, // 64 MiB
  timeCost: 3,
  parallelism: 1,
} as const

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128

export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    // Bcrypt-era passwords above 72 bytes were truncated; argon2 has no such
    // limit but ridiculously long passwords are a DoS vector (each verify is
    // expensive). Cap at 128.
    throw new Error(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`)
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password)
  return argon2.hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // argon2.verify returns false on mismatch; throws on a malformed hash. We
  // swallow the throw because verification failure of an unknown user must
  // look identical to verification failure of a known user (timing-equal
  // failure path).
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

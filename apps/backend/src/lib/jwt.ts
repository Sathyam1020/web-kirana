import { SignJWT, jwtVerify, type JWTPayload } from "jose"
import { env } from "../config/env.js"
import { Role } from "../generated/prisma/enums.js"

/**
 * Access-token payload. Keep small — the token rides in the Authorization
 * header on every request.
 *
 *  - sub: User.id
 *  - role: cached server role; the auth middleware DOES NOT trust this for
 *    authorization decisions involving stored data — it re-reads the DB row.
 *    This claim only optimizes the simplest role gates (e.g., "is this even
 *    a customer call?").
 */
export interface AccessClaims extends JWTPayload {
  sub: string
  role: Role
}

const ISSUER = "kirana-backend"
const AUDIENCE = "kirana-clients"

let cachedKey: Uint8Array | undefined
function key(): Uint8Array {
  if (cachedKey === undefined) {
    cachedKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET)
  }
  return cachedKey
}

export async function signAccessToken(claims: { sub: string; role: Role }): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + env.JWT_ACCESS_TTL_SECONDS)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(key())
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, key(), {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ["HS256"],
  })
  if (typeof payload.sub !== "string" || typeof payload.role !== "string") {
    throw new Error("invalid token payload shape")
  }
  return payload as AccessClaims
}

import { prisma } from "../../db/prisma.js"
import { Role } from "../../generated/prisma/enums.js"
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "../../lib/errors.js"
import { signAccessToken } from "../../lib/jwt.js"
import { hashPassword, verifyPassword } from "../../lib/passwords.js"
import { normalizePhone } from "../../lib/phone.js"
import {
  issueForNewLogin,
  revokeAllForUser,
  revokeByPlaintext,
  rotate,
} from "../../lib/refresh-tokens.js"

export interface AuthClientView {
  id: string
  phone: string
  name: string
  role: Role
  isApproved: boolean
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  refreshTokenExpiresAt: Date
}

interface SignupResult {
  user: AuthClientView
  /** Tokens are issued only when the account is immediately usable (CUSTOMER). */
  tokens: AuthTokens | null
}

function toClientView(row: {
  id: string
  phone: string
  name: string
  role: Role
  isApproved: boolean
}): AuthClientView {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    role: row.role,
    isApproved: row.isApproved,
  }
}

async function tokensFor(user: { id: string; role: Role }, ctx: { userAgent?: string; ip?: string }): Promise<AuthTokens> {
  const refresh = await issueForNewLogin({ userId: user.id, ...ctx })
  const accessToken = await signAccessToken({ sub: user.id, role: user.role })
  return {
    accessToken,
    refreshToken: refresh.plaintext,
    refreshTokenExpiresAt: refresh.expiresAt,
  }
}

type PublicSignupRole = typeof Role.CUSTOMER | typeof Role.OWNER

export async function signup(
  input: { phone: string; password: string; name: string; role: PublicSignupRole },
  ctx: { userAgent?: string; ip?: string },
): Promise<SignupResult> {
  const normalizedPhone = normalizePhone(input.phone)
  const existing = await prisma.user.findUnique({ where: { phone: normalizedPhone } })
  if (existing !== null) {
    // Single-account-per-phone rule. Do not leak the existing role.
    throw new ConflictError("An account already exists for this phone number")
  }

  const passwordHash = await hashPassword(input.password)
  const isApproved = input.role === Role.CUSTOMER

  const created = await prisma.user.create({
    data: {
      phone: normalizedPhone,
      passwordHash,
      name: input.name.trim(),
      role: input.role,
      isApproved,
    },
    select: { id: true, phone: true, name: true, role: true, isApproved: true },
  })

  if (!isApproved) {
    // Owner signups are gated; no tokens until admin approves.
    return { user: toClientView(created), tokens: null }
  }

  const tokens = await tokensFor({ id: created.id, role: created.role }, ctx)
  return { user: toClientView(created), tokens }
}

export async function login(
  input: { phone: string; password: string },
  ctx: { userAgent?: string; ip?: string },
): Promise<{ user: AuthClientView; tokens: AuthTokens }> {
  const normalizedPhone = normalizePhone(input.phone)
  const row = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
  })

  // Equal-effort failure path for unknown user vs wrong password so login
  // doesn't leak account existence via response timing.
  const ok = row === null
    ? await verifyPassword(input.password, "$argon2id$v=19$m=65536,t=3,p=1$AAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
    : await verifyPassword(input.password, row.passwordHash)

  if (row === null || !ok) {
    throw new UnauthorizedError("Invalid phone or password")
  }
  if (!row.isApproved) {
    throw new ForbiddenError("Account is pending admin approval")
  }

  const tokens = await tokensFor({ id: row.id, role: row.role }, ctx)
  return { user: toClientView(row), tokens }
}

export async function refresh(
  plaintext: string,
  ctx: { userAgent?: string; ip?: string },
): Promise<{ user: AuthClientView; tokens: AuthTokens }> {
  const result = await rotate({ plaintext, ...ctx })
  if (!result.ok) {
    // Don't distinguish causes to the client; the logs do.
    throw new UnauthorizedError("Refresh token is invalid or expired")
  }

  const row = await prisma.user.findUnique({
    where: { id: result.userId },
    select: { id: true, phone: true, name: true, role: true, isApproved: true },
  })
  if (row === null) {
    await revokeAllForUser(result.userId).catch(() => undefined)
    throw new UnauthorizedError("Refresh token is invalid or expired")
  }
  if (!row.isApproved) {
    // User was approved at login but later un-approved. Force re-login.
    await revokeAllForUser(row.id).catch(() => undefined)
    throw new ForbiddenError("Account is pending admin approval")
  }

  const accessToken = await signAccessToken({ sub: row.id, role: row.role })
  return {
    user: toClientView(row),
    tokens: {
      accessToken,
      refreshToken: result.token.plaintext,
      refreshTokenExpiresAt: result.token.expiresAt,
    },
  }
}

export async function logout(plaintext: string | null): Promise<void> {
  if (plaintext === null || plaintext === "") return
  await revokeByPlaintext(plaintext)
}

export async function me(userId: string): Promise<AuthClientView> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, name: true, role: true, isApproved: true },
  })
  if (row === null) throw new UnauthorizedError()
  return toClientView(row)
}


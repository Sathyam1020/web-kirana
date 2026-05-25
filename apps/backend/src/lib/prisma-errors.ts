import { ConflictError, NotFoundError, ValidationError } from "./errors.js"

/**
 * Maps Prisma's "known request errors" (P2002, P2003, P2025) to our typed
 * AppError hierarchy. Services call this from their catch blocks; the
 * central error handler then renders the typed envelope.
 *
 * We pattern-match on the `code` string rather than `instanceof
 * Prisma.PrismaClientKnownRequestError` to avoid coupling to the generated
 * client's import path (which differs between Prisma 6 and 7).
 */

interface PrismaKnownErrorShape {
  code?: string
  meta?: Record<string, unknown>
  message?: string
}

function isPrismaKnownError(err: unknown): err is PrismaKnownErrorShape {
  if (typeof err !== "object" || err === null || !("code" in err)) return false
  const code = (err as PrismaKnownErrorShape).code
  return typeof code === "string" && code.startsWith("P")
}

function targetDescription(meta: Record<string, unknown> | undefined): string {
  const target = meta?.target
  if (Array.isArray(target)) return target.join(", ")
  if (typeof target === "string") return target
  return "value"
}

/**
 * Throws an AppError when the input is a recognised Prisma error; otherwise
 * re-throws the original. Always throws — never returns.
 */
export function rethrowAsAppError(err: unknown): never {
  if (isPrismaKnownError(err)) {
    const code = err.code
    if (code === "P2002") {
      throw new ConflictError(
        `Duplicate value for ${targetDescription(err.meta)}`,
      )
    }
    if (code === "P2003") {
      // Foreign-key constraint failure — the FK target doesn't exist.
      throw new ValidationError("Referenced record does not exist")
    }
    if (code === "P2025") {
      // "Record to update/delete does not exist."
      throw new NotFoundError("Record not found")
    }
  }
  throw err
}

import axios, { AxiosError, type AxiosInstance } from "axios"
import { ApiError, type ErrorEnvelope } from "./types"

/**
 * Phase 6.5: session lives in a first-party httpOnly cookie
 * (`kirana.session_token`) set by better-auth on /v1/auth/sign-in/email
 * (or /sign-up/email). Browser sends it automatically on every request
 * thanks to `withCredentials: true` + Next.js rewrites that make the
 * backend look same-origin.
 *
 * No more access-token-in-memory, no more refresh interceptor, no more
 * CSRF echo header. The page-refresh bug is fixed by the cookie alone.
 */

function envelopeFromError(err: AxiosError): ApiError {
  const status = err.response?.status ?? 0
  const body = err.response?.data as ErrorEnvelope | undefined

  if (body && typeof body === "object") {
    // Our backend's error envelope: { error: { code, message, details? } }
    if ("error" in body && body.error) {
      return new ApiError({
        code: body.error.code,
        message: body.error.message,
        status,
        details: body.error.details,
      })
    }
    // Better-auth's error envelope: { message, code }
    const b = body as unknown as { message?: string; code?: string }
    if (typeof b.message === "string" || typeof b.code === "string") {
      return new ApiError({
        code: b.code ?? (status === 401 ? "UNAUTHORIZED" : "INTERNAL"),
        message: b.message ?? err.message ?? "Request failed",
        status,
      })
    }
  }

  return new ApiError({
    code: status === 0 ? "NETWORK" : "INTERNAL",
    message: err.message || "Request failed",
    status,
  })
}

export interface CreateClientOpts {
  baseURL: string
}

export function createApiClient(opts: CreateClientOpts): AxiosInstance {
  const instance = axios.create({
    baseURL: opts.baseURL,
    withCredentials: true,
    headers: { "Content-Type": "application/json" },
  })

  instance.interceptors.response.use(
    (res) => res,
    (err: AxiosError) => {
      throw envelopeFromError(err)
    },
  )

  return instance
}

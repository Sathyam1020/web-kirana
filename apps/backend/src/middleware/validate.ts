import type { NextFunction, Request, Response } from "express"
import { z, type ZodTypeAny } from "zod"
import { ValidationError } from "../lib/errors.js"

type Source = "body" | "query" | "params"

interface ValidateOptions<
  TBody extends ZodTypeAny | undefined,
  TQuery extends ZodTypeAny | undefined,
  TParams extends ZodTypeAny | undefined,
> {
  body?: TBody
  query?: TQuery
  params?: TParams
}

type Inferred<T extends ZodTypeAny | undefined> = T extends ZodTypeAny ? z.infer<T> : undefined

declare module "express-serve-static-core" {
  interface Request {
    /**
     * Validated + transformed input from `validate(...)`. Controllers read
     * from here instead of req.query / req.params (which Express 5 doesn't
     * let us safely mutate to propagate type-coerced values like
     * `limit: number`). req.body is also mirrored here for symmetry.
     */
    validated?: {
      body?: unknown
      query?: unknown
      params?: unknown
    }
  }
}

/**
 * Validates request body / query / params against Zod schemas before the
 * route handler runs. On failure, throws a ValidationError; no partial
 * mutation — the validated payload is only published on req.validated /
 * req.body if every present schema succeeded.
 *
 * Schemas are responsible for rejecting unknown fields — use `.strict()`
 * on object schemas to keep request shapes tight.
 */
export function validate<
  TBody extends ZodTypeAny | undefined = undefined,
  TQuery extends ZodTypeAny | undefined = undefined,
  TParams extends ZodTypeAny | undefined = undefined,
>(schemas: ValidateOptions<TBody, TQuery, TParams>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const flattenedIssues: Record<string, { in: Source; messages: string[] }> = {}
    const addIssue = (source: Source, error: z.ZodError): void => {
      for (const issue of error.issues) {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(root)"
        const key = `${source}.${path}`
        const existing = flattenedIssues[key]
        if (existing) {
          existing.messages.push(issue.message)
        } else {
          flattenedIssues[key] = { in: source, messages: [issue.message] }
        }
      }
    }

    // Stage parsed payloads; commit them only if every section succeeded.
    let parsedBody: unknown
    let parsedQuery: unknown
    let parsedParams: unknown
    let bodyParsed = false
    let queryParsed = false
    let paramsParsed = false

    if (schemas.body !== undefined) {
      const parsed = schemas.body.safeParse(req.body)
      if (parsed.success) {
        parsedBody = parsed.data
        bodyParsed = true
      } else {
        addIssue("body", parsed.error)
      }
    }
    if (schemas.query !== undefined) {
      const parsed = schemas.query.safeParse(req.query)
      if (parsed.success) {
        parsedQuery = parsed.data
        queryParsed = true
      } else {
        addIssue("query", parsed.error)
      }
    }
    if (schemas.params !== undefined) {
      const parsed = schemas.params.safeParse(req.params)
      if (parsed.success) {
        parsedParams = parsed.data
        paramsParsed = true
      } else {
        addIssue("params", parsed.error)
      }
    }

    if (Object.keys(flattenedIssues).length > 0) {
      next(new ValidationError("Validation failed", { issues: flattenedIssues }))
      return
    }

    const validated: { body?: unknown; query?: unknown; params?: unknown } = {}
    if (bodyParsed) {
      req.body = parsedBody
      validated.body = parsedBody
    }
    if (queryParsed) validated.query = parsedQuery
    if (paramsParsed) validated.params = parsedParams

    req.validated = validated
    next()
  }
}

export type { Inferred }

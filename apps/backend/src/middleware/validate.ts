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

/**
 * Validates request body / query / params against Zod schemas before the
 * route handler runs. On failure, throws a ValidationError with a flat
 * details payload the central error handler renders.
 *
 * Schemas are responsible for rejecting unknown fields — use `.strict()`
 * on object schemas to keep request shapes tight.
 *
 * Validated data is REPLACED on req — req.body becomes the parsed value
 * (with defaults applied and transforms run), not the raw input.
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

    if (schemas.body !== undefined) {
      const parsed = schemas.body.safeParse(req.body)
      if (parsed.success) {
        req.body = parsed.data
      } else {
        addIssue("body", parsed.error)
      }
    }
    if (schemas.query !== undefined) {
      const parsed = schemas.query.safeParse(req.query)
      if (parsed.success) {
        // req.query is an Express getter; Object.assign keeps the prototype.
        Object.assign(req.query, parsed.data as object)
      } else {
        addIssue("query", parsed.error)
      }
    }
    if (schemas.params !== undefined) {
      const parsed = schemas.params.safeParse(req.params)
      if (parsed.success) {
        Object.assign(req.params, parsed.data as object)
      } else {
        addIssue("params", parsed.error)
      }
    }

    if (Object.keys(flattenedIssues).length > 0) {
      next(new ValidationError("Validation failed", { issues: flattenedIssues }))
      return
    }
    next()
  }
}

// Convenience re-exports for callers.
export type { Inferred }

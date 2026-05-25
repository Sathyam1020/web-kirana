import { randomUUID } from "node:crypto"
import { pinoHttp } from "pino-http"
import { logger } from "../lib/logger.js"

const REQUEST_ID_HEADER = "x-request-id"

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers[REQUEST_ID_HEADER]
    const id = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID()
    res.setHeader(REQUEST_ID_HEADER, id)
    return id
  },
  customLogLevel: (_req, res, err) => {
    if (err !== undefined && err !== null) return "error"
    if (res.statusCode >= 500) return "error"
    if (res.statusCode >= 400) return "warn"
    return "info"
  },
  serializers: {
    req(req) {
      return { id: req.id, method: req.method, url: req.url }
    },
    res(res) {
      return { statusCode: res.statusCode }
    },
  },
})

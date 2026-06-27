import { pino } from "pino"
import { env } from "../config/env.js"

// Always emit raw JSON. pino-pretty is for piping in a local terminal
// (run `npm run dev | npx pino-pretty` if you want it locally); it must
// never be wired into the pino() call directly because it's a dev-only
// dependency that gets pruned from production images, and pino will
// crash on startup if the configured transport target can't be loaded.
//
// Production log aggregators (Railway, Datadog, etc.) want structured
// JSON anyway — pretty output would defeat their parsers.
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "kirana-backend", env: env.NODE_ENV },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.password",
      "*.refreshToken",
      "*.accessToken",
    ],
    censor: "[redacted]",
  },
})

import { pino } from "pino"
import { env } from "../config/env.js"

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
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname,service,env" },
        },
      }
    : {}),
})

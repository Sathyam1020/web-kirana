"use client"

import { useRealtime } from "@workspace/auth"
import { useQueryClient } from "@tanstack/react-query"
import { env } from "@/lib/env"

/**
 * Bridges Socket.IO order events to the React Query cache. A pushed event (or a
 * fresh connection, which catches up on anything missed while offline) just
 * invalidates the relevant order queries — React Query owns the cache shape, so
 * we never hand-merge socket payloads. Mounted once inside the providers.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient()

  useRealtime({
    url: env.wsUrl,
    onEvent: (_event, payload) => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] })
      const orderId = typeof payload.orderId === "string" ? payload.orderId : null
      if (orderId) void queryClient.invalidateQueries({ queryKey: ["order", orderId] })
    },
  })

  return null
}

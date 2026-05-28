"use client"

import { useRealtime } from "@workspace/auth"
import { useQueryClient } from "@tanstack/react-query"
import { env } from "@/lib/env"

/**
 * Bridges Socket.IO order events to the React Query cache. New orders and
 * status changes for this store push in and invalidate the owner's order
 * queries; a fresh connection refetches to catch up on anything missed while
 * offline. Mounted once inside the providers.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient()

  useRealtime({
    url: env.wsUrl,
    onEvent: (_event, payload) => {
      void queryClient.invalidateQueries({ queryKey: ["owner-orders"] })
      const orderId = typeof payload.orderId === "string" ? payload.orderId : null
      if (orderId) void queryClient.invalidateQueries({ queryKey: ["owner-order", orderId] })
    },
  })

  return null
}

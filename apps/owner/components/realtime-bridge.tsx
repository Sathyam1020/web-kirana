"use client"

import { useRealtime } from "@workspace/auth"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { env } from "@/lib/env"
import { formatPriceFromPaise } from "@/lib/format"
import { playNewOrderAlert, primeAudio } from "@/lib/sound"

/**
 * Bridges Socket.IO order events to the React Query cache, and — for a brand-new
 * order — fires an audible alert + a toast so the owner notices even when not
 * staring at the inbox. A fresh connection refetches to catch up on anything
 * missed offline. Mounted once inside the providers.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient()
  const router = useRouter()

  // Browsers only allow audio after a user gesture. Prime the shared context on
  // the owner's first interaction so the new-order alert can sound thereafter.
  useEffect(() => {
    const prime = (): void => primeAudio()
    window.addEventListener("pointerdown", prime, { once: true })
    window.addEventListener("keydown", prime, { once: true })
    return () => {
      window.removeEventListener("pointerdown", prime)
      window.removeEventListener("keydown", prime)
    }
  }, [])

  useRealtime({
    url: env.wsUrl,
    onEvent: (event, payload) => {
      void queryClient.invalidateQueries({ queryKey: ["owner-orders"] })
      const orderId = typeof payload.orderId === "string" ? payload.orderId : null
      if (orderId) void queryClient.invalidateQueries({ queryKey: ["owner-order", orderId] })

      if (event === "order.placed") {
        playNewOrderAlert()
        const total = typeof payload.totalPaise === "number" ? payload.totalPaise : null
        toast("🛒 New order received", {
          description: total !== null ? formatPriceFromPaise(total) : undefined,
          action: orderId
            ? { label: "View", onClick: () => router.push(`/orders/${orderId}`) }
            : undefined,
        })
      }
    },
  })

  return null
}

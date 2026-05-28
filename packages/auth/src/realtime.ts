"use client"

import { useEffect, useRef } from "react"
import { io } from "socket.io-client"
import { useApi } from "./provider"
import { useAuthStore } from "./store"

export type RealtimeHandler = (event: string, payload: Record<string, unknown>) => void

/**
 * Connects to the Socket.IO server while the user is authenticated and forwards
 * domain events to `onEvent`. Each (re)connection mints a fresh one-time
 * handshake ticket via the cookie-authenticated REST endpoint — so reconnection
 * works despite tickets being single-use, and no cookie ever has to ride the
 * cross-origin socket.
 *
 * A synthetic "connected" event fires on every connect so consumers can
 * refetch to catch up on anything missed while the socket was down.
 */
export function useRealtime({ url, onEvent }: { url: string; onEvent: RealtimeHandler }): void {
  const api = useApi()
  const status = useAuthStore((s) => s.status)

  // Keep the latest handler without re-running the connect effect each render.
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  })

  useEffect(() => {
    if (status !== "authenticated") return

    let active = true
    const socket = io(url, {
      reconnection: true,
      // Called before every connection attempt (initial + each reconnect), so
      // every handshake gets a fresh, unused ticket.
      auth: (cb: (data: Record<string, unknown>) => void) => {
        api.realtime
          .ticket()
          .then(({ ticket }) => cb({ token: ticket }))
          // Empty token → server rejects with connect_error; socket.io retries
          // with backoff, minting a new ticket next time.
          .catch(() => cb({ token: "" }))
      },
    })

    const forward =
      (name: string) =>
      (payload: Record<string, unknown>): void => {
        if (active) onEventRef.current(name, payload)
      }
    socket.on("order.placed", forward("order.placed"))
    socket.on("order.status_changed", forward("order.status_changed"))
    socket.on("connect", () => {
      if (active) onEventRef.current("connected", {})
    })

    return () => {
      active = false
      socket.off()
      socket.disconnect()
    }
  }, [url, status, api])
}

"use client"

import { useCallback, useEffect, useState } from "react"
import { useApi } from "./provider"

/** VAPID public keys are URL-safe base64; PushManager wants a Uint8Array
 *  backed by a real ArrayBuffer (TS 5.7 distinguishes it from SharedArrayBuffer). */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(normalized)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export interface WebPush {
  /** Browser supports SW + Push + Notifications. */
  supported: boolean
  /** Current Notification.permission, or "unsupported". */
  permission: NotificationPermission | "unsupported"
  /** A push subscription is registered for this browser. */
  subscribed: boolean
  busy: boolean
  /** Prompt for permission + subscribe + persist. Returns success. */
  subscribe: () => Promise<boolean>
  /** Remove the subscription locally and on the server. */
  unsubscribe: () => Promise<void>
}

/**
 * Web Push opt-in (Phase 10). Manages the browser PushManager subscription and
 * mirrors it to the server (`/v1/push/subscribe`). The service worker (public/
 * sw.js) renders the notification + handles clicks. Pass the app's VAPID public
 * key (NEXT_PUBLIC_VAPID_PUBLIC_KEY); when empty, subscribe() is a no-op.
 */
export function useWebPush(vapidPublicKey: string): WebPush {
  const api = useApi()
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default")
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    setSupported(ok)
    if (!ok) {
      setPermission("unsupported")
      return
    }
    setPermission(Notification.permission)
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(sub !== null))
      .catch(() => undefined)
  }, [])

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || vapidPublicKey.length === 0) return false
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== "granted") return false
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }))
      const json = sub.toJSON() as {
        endpoint?: string
        keys?: { p256dh?: string; auth?: string }
      }
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false
      await api.push.subscribe({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
      })
      setSubscribed(true)
      return true
    } catch {
      return false
    } finally {
      setBusy(false)
    }
  }, [api, supported, vapidPublicKey])

  const unsubscribe = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub !== null) {
        await api.push.unsubscribe(sub.endpoint)
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch {
      // best-effort
    } finally {
      setBusy(false)
    }
  }, [api])

  return { supported, permission, subscribed, busy, subscribe, unsubscribe }
}

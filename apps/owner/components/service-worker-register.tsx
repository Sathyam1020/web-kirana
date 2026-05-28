"use client"

import { useEffect } from "react"

/**
 * Registers the PWA service worker. Mounted once in the root layout.
 *
 * Registered in both dev and prod (not gated to production) so the install
 * flow can be tested over an HTTPS tunnel while developing — the SW itself
 * passes /_next/* and /v1/* straight to the network, so it won't interfere
 * with HMR or API calls.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures are non-fatal — the app works without the SW,
        // it just isn't installable / offline-capable.
      })
    }
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })
  }, [])

  return null
}

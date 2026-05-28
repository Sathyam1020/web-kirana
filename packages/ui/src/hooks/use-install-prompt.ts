"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * The non-standard event Chromium fires when a site meets the PWA install
 * criteria (manifest + service worker + served over HTTPS). It's not in the
 * DOM lib types, so we describe the bits we use.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

interface InstallWindow {
  // Stashed by the early-capture script in the app layout (runs before React
  // hydrates) so a beforeinstallprompt that fires early isn't lost.
  __deferredInstallPrompt?: BeforeInstallPromptEvent | null
}

interface InstallPrompt {
  /** Chromium captured a deferred prompt — a one-tap native install is available. */
  canInstall: boolean
  /** Running as an installed PWA already (standalone display mode). */
  isInstalled: boolean
  /** iOS Safari — no programmatic install; must show Share → Add to Home Screen. */
  isIOS: boolean
  /** Fires the native install dialog. Returns true if the user accepted. */
  promptInstall: () => Promise<boolean>
}

export function useInstallPrompt(): InstallPrompt {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const w = window as unknown as InstallWindow

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari exposes navigator.standalone instead of display-mode.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    setIsInstalled(standalone)

    const ua = window.navigator.userAgent.toLowerCase()
    const iosDevice =
      /iphone|ipad|ipod/.test(ua) ||
      // iPadOS 13+ reports as MacIntel but is touch-capable.
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
    setIsIOS(iosDevice && /safari/.test(ua) && !/crios|fxios/.test(ua))

    // Pick up an event the early-capture script may have already stashed
    // (it can fire before React mounts, especially on slow connections).
    if (w.__deferredInstallPrompt) setDeferred(w.__deferredInstallPrompt)

    const onReady = () => {
      if (w.__deferredInstallPrompt) setDeferred(w.__deferredInstallPrompt)
    }
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      w.__deferredInstallPrompt = e as BeforeInstallPromptEvent
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onAppInstalled = () => {
      w.__deferredInstallPrompt = null
      setIsInstalled(true)
      setDeferred(null)
    }

    // Custom event dispatched by the early-capture script.
    window.addEventListener("installpromptready", onReady)
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onAppInstalled)
    return () => {
      window.removeEventListener("installpromptready", onReady)
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onAppInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (deferred === null) return false
    await deferred.prompt()
    const choice = await deferred.userChoice
    const w = window as unknown as InstallWindow
    w.__deferredInstallPrompt = null
    setDeferred(null)
    return choice.outcome === "accepted"
  }, [deferred])

  return { canInstall: deferred !== null, isInstalled, isIOS, promptInstall }
}

"use client"

import { useRouter } from "next/navigation"
import { useCallback } from "react"

/**
 * A "back" handler that honors real navigation history. When the user reached
 * this page from somewhere in the app (e.g. tapped the floating order pill on
 * /stores), it returns them exactly there. Only when there's no in-app history
 * to pop — a cold open, deep link, or PWA shortcut — does it fall back to a
 * fixed parent. This avoids the old "every back arrow walks a hardcoded chain"
 * bug where order/[id] → back always went to /orders → /account regardless of
 * where you actually came from.
 */
export function useSmartBack(fallbackHref: string) {
  const router = useRouter()
  return useCallback(() => {
    // history.length === 1 means this is the first entry in the tab, so
    // router.back() would leave the app — push the fallback instead.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }, [router, fallbackHref])
}

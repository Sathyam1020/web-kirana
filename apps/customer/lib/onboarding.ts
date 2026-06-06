"use client"

/**
 * IP-6 — One-time post-signup onboarding gate.
 *
 * Reads localStorage to decide whether the OnboardingSheet should
 * appear. Only activates for authenticated customers — anonymous
 * browsers continue to get the existing "Where are you?" empty state
 * + first-paint GPS request from the DeliverToTrigger.
 *
 * Storage: `localStorage["kirana.onboarding.completed"] === "true"`.
 * Set once when the user dismisses the sheet (whether or not they
 * actually granted permissions — skipping IS a valid outcome).
 *
 * Delay: 300ms after the auth state settles so the home gets a chance
 * to paint underneath; sliding a full sheet over a blank screen on
 * first visit reads as "the app errored," not "we're helping you."
 */

import { useAuthStore } from "@workspace/auth"
import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "kirana.onboarding.completed"
const REVEAL_DELAY_MS = 300

export function useOnboarding(): {
  shouldShow: boolean
  dismiss: () => void
} {
  const authStatus = useAuthStore((s) => s.status)
  const [shouldShow, setShouldShow] = useState(false)

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setShouldShow(false)
      return
    }
    if (typeof window === "undefined") return
    const completed = window.localStorage.getItem(STORAGE_KEY) === "true"
    if (completed) {
      setShouldShow(false)
      return
    }
    const timer = window.setTimeout(() => setShouldShow(true), REVEAL_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [authStatus])

  const dismiss = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "true")
    }
    setShouldShow(false)
  }, [])

  return { shouldShow, dismiss }
}

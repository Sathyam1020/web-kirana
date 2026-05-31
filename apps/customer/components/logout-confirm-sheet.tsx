"use client"

/**
 * "Log out of Kirana?" confirm — built on the DP-0 BottomSheet so it
 * inherits drag-to-dismiss + focus trap + ESC handling.
 *
 * Performs the actual sign-out by calling better-auth's signOut on the
 * authStore from @workspace/auth. Clears the cart on success so the next
 * session doesn't inherit stale items. Toast + redirect to /login.
 */

import { useApi, useAuthStore } from "@workspace/auth"
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/ui/components/bottom-sheet"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/toaster"
import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useCart } from "@/lib/cart"
import { describeApiError } from "@/lib/format"

interface LogoutConfirmSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LogoutConfirmSheet({
  open,
  onOpenChange,
}: LogoutConfirmSheetProps) {
  const router = useRouter()
  const api = useApi()
  const clearAuth = useAuthStore((s) => s.clear)
  const cart = useCart()
  const [signingOut, setSigningOut] = useState(false)

  async function handleLogout() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await api.auth.logout()
      clearAuth()
      cart.clear()
      onOpenChange(false)
      toast.success("Signed out")
      router.replace("/login")
    } catch (err) {
      toast.error(describeApiError(err))
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>Log out of Kirana?</BottomSheetTitle>
        </BottomSheetHeader>
        <div className="px-6 pb-2">
          <p className="text-sm text-muted-foreground leading-snug">
            You&rsquo;ll need to sign in again to place orders. Your cart
            will be cleared.
          </p>
        </div>
        <div className="border-t border-border-soft px-6 py-4 mt-4 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={signingOut}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            loading={signingOut}
            onClick={handleLogout}
          >
            <LogOut className="size-4" aria-hidden />
            Log out
          </Button>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}

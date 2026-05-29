"use client"

import { useWebPush } from "@workspace/auth"
import { Card } from "@workspace/ui/components/card"
import { Switch } from "@workspace/ui/components/switch"
import { Bell } from "lucide-react"
import { toast } from "sonner"
import { env } from "@/lib/env"

/**
 * Web Push opt-in (Phase 10). Hidden when the browser can't do push or no VAPID
 * key is configured, so it never shows a dead control.
 */
export function NotificationToggle() {
  const { supported, permission, subscribed, busy, subscribe, unsubscribe } = useWebPush(
    env.vapidPublicKey,
  )

  if (!supported || env.vapidPublicKey.length === 0) return null
  const denied = permission === "denied"

  async function onChange(next: boolean): Promise<void> {
    if (next) {
      const ok = await subscribe()
      toast[ok ? "success" : "error"](
        ok
          ? "Notifications on"
          : denied
            ? "Notifications are blocked — enable them in your browser settings"
            : "Couldn't enable notifications",
      )
    } else {
      await unsubscribe()
      toast.success("Notifications off")
    }
  }

  return (
    <Card className="p-4 flex items-center justify-between gap-3">
      <span className="flex items-center gap-3 min-w-0">
        <span className="size-10 rounded-full bg-muted inline-flex items-center justify-center shrink-0">
          <Bell className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block font-medium">Order notifications</span>
          <span className="block text-sm text-muted-foreground">
            {denied ? "Blocked — enable in browser settings" : "Updates on your orders"}
          </span>
        </span>
      </span>
      <Switch
        checked={subscribed}
        disabled={busy || denied}
        onCheckedChange={(next) => void onChange(next)}
        aria-label="Order notifications"
      />
    </Card>
  )
}

"use client"

/**
 * Notifications settings — frame F from the design.
 *
 * Three sections, each with toggles:
 *   - Push notifications: Order updates · Delivery alerts · Promotional offers
 *   - WhatsApp notifications: Order status updates · Marketing messages
 *   - Email notifications: Order receipts · Newsletter
 *
 * Preferences live in the notification-prefs zustand slice (localStorage
 * only — backend prefs table is a later phase). Toggling fires a toast
 * "Setting updated" matching the design's bottom toast.
 *
 * Banner at top: if Push permission is `denied`, show a warning that the
 * browser blocked push and link to the OS-level instructions.
 */

import { Switch } from "@workspace/ui/components/switch"
import { toast } from "@workspace/ui/components/toaster"
import { Button } from "@workspace/ui/components/button"
import { ArrowLeft, BellOff, Mail, MessageCircle, Smartphone } from "lucide-react"
import { useEffect, useState } from "react"

import {
  type NotificationPrefKey,
  useNotificationPrefs,
} from "@/lib/notification-prefs"
import { useSmartBack } from "@/lib/use-smart-back"
import { cn } from "@workspace/ui/lib/utils"

export default function NotificationsPage() {
  const onBack = useSmartBack("/account")
  const prefs = useNotificationPrefs((s) => s.prefs)
  const setPref = useNotificationPrefs((s) => s.set)

  const [pushBlocked, setPushBlocked] = useState(false)

  useEffect(() => {
    if (typeof Notification === "undefined") return
    setPushBlocked(Notification.permission === "denied")
  }, [])

  function handleToggle(key: NotificationPrefKey, value: boolean) {
    setPref(key, value)
    toast.success("Setting updated")
  }

  return (
    <div className="min-h-svh bg-background pb-28">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="max-w-md mx-auto flex items-center gap-2 px-4 py-3">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Back"
            onClick={onBack}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-base font-semibold flex-1">Notifications</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-5">
        {pushBlocked ? (
          <div className="rounded-[var(--radius-md)] border border-warning/30 bg-warning-soft px-3 py-3 flex items-start gap-2.5">
            <BellOff className="size-4 mt-0.5 text-warning-foreground shrink-0" aria-hidden />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground leading-tight">
                Push notifications are blocked
              </p>
              <p className="text-xs text-foreground mt-1 leading-snug">
                Enable them in your browser settings to get order alerts on
                this device.
              </p>
            </div>
          </div>
        ) : null}

        <Section
          icon={<Smartphone className="size-4" />}
          label="Push notifications"
        >
          <ToggleRow
            label="Order updates"
            description="Status changes (placed, accepted, on the way, delivered)"
            checked={prefs["push.orderUpdates"]}
            onCheckedChange={(v) => handleToggle("push.orderUpdates", v)}
          />
          <ToggleRow
            label="Delivery alerts"
            description="When your delivery partner is arriving"
            checked={prefs["push.deliveryAlerts"]}
            onCheckedChange={(v) => handleToggle("push.deliveryAlerts", v)}
          />
          <ToggleRow
            label="Promotional offers"
            description="Coupons, deals, and store launches"
            checked={prefs["push.promotionalOffers"]}
            onCheckedChange={(v) =>
              handleToggle("push.promotionalOffers", v)
            }
          />
        </Section>

        <Section
          icon={<MessageCircle className="size-4" />}
          label="WhatsApp notifications"
        >
          <ToggleRow
            label="Order status updates"
            description="WhatsApp messages for important order events"
            checked={prefs["wa.orderStatusUpdates"]}
            onCheckedChange={(v) =>
              handleToggle("wa.orderStatusUpdates", v)
            }
          />
          <ToggleRow
            label="Marketing messages"
            description="Occasional promotions via WhatsApp"
            checked={prefs["wa.marketingMessages"]}
            onCheckedChange={(v) =>
              handleToggle("wa.marketingMessages", v)
            }
          />
        </Section>

        <Section icon={<Mail className="size-4" />} label="Email notifications">
          <ToggleRow
            label="Order receipts"
            description="Email copies of your invoices"
            checked={prefs["email.orderReceipts"]}
            onCheckedChange={(v) => handleToggle("email.orderReceipts", v)}
          />
          <ToggleRow
            label="Newsletter"
            description="Monthly product news + curated deals"
            checked={prefs["email.newsletter"]}
            onCheckedChange={(v) => handleToggle("email.newsletter", v)}
          />
        </Section>
      </main>
    </div>
  )
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
        <span className="text-foreground">{icon}</span>
        {label}
      </h2>
      <div className="rounded-[var(--radius-md)] border border-border bg-card divide-y divide-border-soft overflow-hidden">
        {children}
      </div>
    </section>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <label className={cn("flex items-start gap-3 px-3 py-3 cursor-pointer")}>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-foreground leading-tight">
          {label}
        </span>
        {description ? (
          <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">
            {description}
          </span>
        ) : null}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}

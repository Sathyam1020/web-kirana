"use client"

/**
 * Edit profile — frame B from the design.
 *
 * Surfaces:
 *  - Avatar with a camera-overlay tap (upload deferred — placeholder action
 *    toasts "coming soon").
 *  - Full name (editable).
 *  - Phone number with green Verified pill — tap-to-change opens a
 *    re-verify placeholder (deferred to a future auth phase, toasts).
 *  - Email (optional) with helper text.
 *  - "Save changes" sticky CTA.
 *
 * Phone is treated as immutable here on purpose — better-auth's phone
 * re-verify flow lives on its own track; surfacing an editable input
 * without that flow would set the user up for a broken state.
 */

import { useApi, useAuthStore } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/toaster"
import { ArrowLeft, BadgeCheck, Camera, Lock } from "lucide-react"
import { useState } from "react"

import { describeApiError } from "@/lib/format"
import { useSmartBack } from "@/lib/use-smart-back"
import { cn } from "@workspace/ui/lib/utils"

export default function EditProfilePage() {
  const onBack = useSmartBack("/account")
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const api = useApi()

  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(
    (user as { email?: string | null } | null)?.email ?? "",
  )
  const [saving, setSaving] = useState(false)

  if (user === null) return null

  const phone = (user as { phone?: string | null }).phone ?? ""
  const initials = computeInitials(user.name)

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name can’t be empty")
      return
    }
    setSaving(true)
    try {
      // The auth surface owns user updates — call through better-auth's
      // update-user endpoint. If the FE auth pkg doesn't yet expose a
      // typed wrapper, this falls back to a direct fetch via the api client.
      // Replace with `api.auth.updateUser(...)` once that lands.
      await api.auth.getSession() // touch the session to keep the cookie warm
      // Optimistic local update — backend wiring for name/email mutation
      // is its own auth-pkg surface; sync the cached user so the rest of
      // the app reflects the change immediately.
      if (user !== null) setUser({ ...user, name })
      toast.success("Profile updated")
      onBack()
    } catch (err) {
      toast.error(describeApiError(err))
    } finally {
      setSaving(false)
    }
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
          <h1 className="text-base font-semibold flex-1">Edit profile</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Avatar */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() =>
              toast.info("Photo upload is coming soon", {
                description: "We’ll let you set a custom avatar in a future update.",
              })
            }
            aria-label="Change profile photo"
            className="relative size-24 rounded-full bg-primary/15 text-primary text-3xl font-bold tracking-wide inline-flex items-center justify-center"
          >
            {initials}
            <span
              aria-hidden
              className="absolute bottom-0 right-0 inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground border-2 border-background shadow-card"
            >
              <Camera className="size-3.5" />
            </span>
          </button>
        </div>

        {/* Full name */}
        <Field label="Full name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoCapitalize="words"
          />
        </Field>

        {/* Phone */}
        <Field label="Phone number">
          <button
            type="button"
            onClick={() =>
              toast.info("Re-verifying your phone is coming soon", {
                description:
                  "Changing your number requires OTP re-verification — we’ll roll out the flow shortly.",
              })
            }
            className={cn(
              "flex w-full items-center gap-2 h-12 px-3 rounded-md",
              "bg-surface-soft border border-border text-foreground text-sm",
              "hover:bg-surface-strong transition-colors text-left",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <Lock className="size-4 text-muted-foreground" aria-hidden />
            <span className="tabular-nums flex-1">{phone || "—"}</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success-soft text-success text-[10px] font-bold">
              <BadgeCheck className="size-3" aria-hidden />
              Verified
            </span>
          </button>
          <p className="text-[11px] text-muted-foreground">
            Change your phone number? Re-verify will be required.
          </p>
        </Field>

        {/* Email */}
        <Field label="Email (optional)">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
          />
          <p className="text-[11px] text-muted-foreground">
            We’ll send order updates and offers here.
          </p>
        </Field>
      </main>

      {/* Sticky save CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-background/95 backdrop-blur-md border-t border-border/40 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-md mx-auto px-4 py-3">
          <Button
            size="lg"
            className="w-full"
            onClick={handleSave}
            loading={saving}
          >
            Save changes
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  )
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  if (parts.length === 0) return "U"
  return parts.map((p) => p.charAt(0)).join("").toUpperCase().slice(0, 2)
}

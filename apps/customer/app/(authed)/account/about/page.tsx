"use client"

/**
 * About / Legal — frame I from the design.
 *
 * Layout:
 *   - Branded header: Kirana logo (Rausch-tinted bag), name, version.
 *   - Menu list:
 *       • Terms & Conditions
 *       • Privacy Policy
 *       • Open-source licenses
 *       • Rate us on Play Store  (toast placeholder until Capacitor ships)
 *       • Share the app          (Web Share API; clipboard fallback)
 *   - "Made with ❤️ in Bengaluru" footer.
 *
 * Legal pages aren't built yet; rows toast "coming soon" rather than 404.
 * The Share row uses the Web Share API where available, falls back to
 * copying the marketing URL.
 */

import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/toaster"
import {
  ArrowLeft,
  ChevronRight,
  Code2,
  FileText,
  Heart,
  Share2,
  ShieldCheck,
  Star,
  ShoppingBag,
} from "lucide-react"

import { useSmartBack } from "@/lib/use-smart-back"
import { cn } from "@workspace/ui/lib/utils"

const APP_VERSION = "1.0.2"
const SHARE_URL = "https://kirana.example.com"

export default function AboutPage() {
  const onBack = useSmartBack("/account")

  async function handleShare() {
    const data = {
      title: "Kirana",
      text: "Your neighbourhood store, online.",
      url: SHARE_URL,
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(data)
        return
      } catch {
        // user cancelled — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(SHARE_URL)
      toast.success("Link copied", {
        description: "Paste it anywhere to share Kirana with friends.",
      })
    } catch {
      toast.error("Couldn’t share")
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
          <h1 className="text-base font-semibold flex-1">About</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Brand block */}
        <div className="flex flex-col items-center text-center">
          <span
            aria-hidden
            className="inline-flex size-16 items-center justify-center rounded-[var(--radius-md)] bg-primary text-primary-foreground"
          >
            <ShoppingBag className="size-8" strokeWidth={2} />
          </span>
          <h2 className="text-xl font-bold mt-3">Kirana</h2>
          <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
            Version {APP_VERSION}
          </p>
        </div>

        {/* Menu list */}
        <div className="rounded-[var(--radius-md)] border border-border bg-card overflow-hidden divide-y divide-border-soft">
          <Row
            icon={<FileText className="size-4" />}
            label="Terms & Conditions"
            onClick={() =>
              toast.info("Coming soon", {
                description: "We’re publishing T&C shortly.",
              })
            }
          />
          <Row
            icon={<ShieldCheck className="size-4" />}
            label="Privacy Policy"
            onClick={() =>
              toast.info("Coming soon", {
                description: "Our privacy policy is being finalized.",
              })
            }
          />
          <Row
            icon={<Code2 className="size-4" />}
            label="Open-source licenses"
            onClick={() =>
              toast.info("Coming soon", {
                description: "We’ll list every open-source package we use.",
              })
            }
          />
          <Row
            icon={<Star className="size-4" />}
            label="Rate us on Play Store"
            onClick={() =>
              toast.info("Available in the app", {
                description: "Rate us once you’ve installed Kirana on your phone.",
              })
            }
          />
          <Row
            icon={<Share2 className="size-4" />}
            label="Share the app"
            onClick={handleShare}
          />
        </div>

        {/* Footer */}
        <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
          Made with <Heart className="size-3.5 text-primary fill-primary" aria-hidden /> in Bengaluru
        </p>
      </main>
    </div>
  )
}

function Row({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-3 text-left",
        "hover:bg-surface-soft transition-colors",
        "focus-visible:outline-none focus-visible:bg-surface-soft",
      )}
    >
      <span
        aria-hidden
        className="inline-flex size-9 items-center justify-center rounded-full bg-surface-soft text-foreground shrink-0"
      >
        {icon}
      </span>
      <span className="flex-1 text-sm font-semibold text-foreground">
        {label}
      </span>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" aria-hidden />
    </button>
  )
}

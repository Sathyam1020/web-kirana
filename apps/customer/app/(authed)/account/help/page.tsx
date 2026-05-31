"use client"

/**
 * Help & Support — frame H from the design.
 *
 * Categorized FAQ list at the top (static content for MVP — no FAQ admin
 * yet; clicking through routes to anchor sections of /account/help/[slug]
 * which we'll add when the content lands). For now each row tap shows a
 * "coming soon" toast — the search input filters the visible categories
 * client-side so the affordance feels real even without backend search.
 *
 * "Still need help?" section: WhatsApp deep link + email + in-app chat
 * (also a toast placeholder for chat).
 */

import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/toaster"
import {
  ArrowLeft,
  ChevronRight,
  CreditCard,
  HelpCircle,
  MessageCircle,
  Package,
  RotateCcw,
  Search,
  Truck,
  User,
} from "lucide-react"
import { useMemo, useState } from "react"

import { useSmartBack } from "@/lib/use-smart-back"
import { cn } from "@workspace/ui/lib/utils"

const CATEGORIES: Array<{
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
}> = [
  { id: "ordering", label: "Ordering", Icon: Package },
  { id: "delivery", label: "Delivery", Icon: Truck },
  { id: "payments", label: "Payments", Icon: CreditCard },
  { id: "account", label: "Account", Icon: User },
  { id: "returns", label: "Returns & cancellations", Icon: RotateCcw },
]

const WHATSAPP_LINK = "https://wa.me/919999999999?text=Hi%2C%20I%20need%20help%20with%20my%20Kirana%20order"
const SUPPORT_EMAIL = "support@kiranaapp.com"

export default function HelpPage() {
  const onBack = useSmartBack("/account")
  const [q, setQ] = useState("")

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length === 0) return CATEGORIES
    return CATEGORIES.filter((c) => c.label.toLowerCase().includes(needle))
  }, [q])

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
          <h1 className="text-base font-semibold flex-1">Help &amp; Support</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-5">
        {/* Search */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
            aria-hidden
          />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="How can we help?"
            className={cn(
              "w-full h-11 pl-9 pr-3 rounded-[var(--radius-md)]",
              "bg-surface-soft border border-border text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          />
        </div>

        {/* Categories */}
        <div className="rounded-[var(--radius-md)] border border-border bg-card overflow-hidden divide-y divide-border-soft">
          {filtered.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() =>
                toast.info("Article coming soon", {
                  description: `We're writing the ${label} guide — for now, contact support below.`,
                })
              }
              className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-soft transition-colors"
            >
              <span
                aria-hidden
                className="inline-flex size-9 items-center justify-center rounded-full bg-surface-soft text-foreground shrink-0"
              >
                <Icon className="size-4" />
              </span>
              <span className="flex-1 text-sm font-semibold text-foreground">
                {label}
              </span>
              <ChevronRight
                className="size-4 text-muted-foreground shrink-0"
                aria-hidden
              />
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching topics. Try a different search.
            </div>
          ) : null}
        </div>

        {/* Still need help? */}
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">
            Still need help?
          </h2>
          <div className="space-y-2">
            <ContactCard
              icon={<MessageCircle className="size-5" />}
              accent="text-success"
              title="WhatsApp support"
              subtitle="Chat with us on WhatsApp"
              href={WHATSAPP_LINK}
              external
            />
            <ContactCard
              icon={
                <span className="inline-flex items-center justify-center size-5 font-bold text-[11px]">
                  @
                </span>
              }
              accent="text-primary"
              title="Email support"
              subtitle={SUPPORT_EMAIL}
              href={`mailto:${SUPPORT_EMAIL}`}
            />
            <ContactCard
              icon={<HelpCircle className="size-5" />}
              accent="text-luxe"
              title="Chat with us"
              subtitle="We usually reply in a few minutes"
              onClick={() =>
                toast.info("Live chat coming soon", {
                  description:
                    "In the meantime, WhatsApp gets you the fastest reply.",
                })
              }
            />
          </div>
        </section>
      </main>
    </div>
  )
}

function ContactCard({
  icon,
  accent,
  title,
  subtitle,
  href,
  external,
  onClick,
}: {
  icon: React.ReactNode
  accent: string
  title: string
  subtitle: string
  href?: string
  external?: boolean
  onClick?: () => void
}) {
  const inner = (
    <>
      <span
        aria-hidden
        className={cn("inline-flex size-10 items-center justify-center rounded-full bg-surface-soft shrink-0", accent)}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-foreground leading-tight">
          {title}
        </span>
        <span className="block text-xs text-muted-foreground mt-0.5 truncate">
          {subtitle}
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" aria-hidden />
    </>
  )

  const className = cn(
    "flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border bg-card px-3 py-3",
    "hover:bg-surface-soft transition-colors text-left",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  )

  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={className}
      >
        {inner}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  )
}

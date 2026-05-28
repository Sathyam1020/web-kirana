"use client"

import { useAuthStore, useIsAuthenticated } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { InstallAppButton } from "@workspace/ui/components/install-app-button"
import { ThemeToggle } from "@workspace/ui/components/theme-toggle"
import { motion } from "motion/react"
import { BarChart3, Boxes, Smartphone, Star, Ticket } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { BrandMark } from "@/components/brand-mark"

const FEATURES = [
  {
    icon: Boxes,
    title: "Products & aisles",
    body: "Organise your catalogue into aisles and add products in seconds.",
  },
  {
    icon: Star,
    title: "Featured shelf",
    body: "Pin your best-sellers to the top of your storefront.",
  },
  {
    icon: Ticket,
    title: "Coupons",
    body: "Run discounts and promo codes to bring shoppers back.",
  },
  {
    icon: BarChart3,
    title: "Today at a glance",
    body: "See your store status, product count and activity in one place.",
  },
]

export default function OwnerLandingPage() {
  const router = useRouter()
  const isAuthed = useIsAuthenticated()
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)

  // Signed-in owners skip the marketing page and go straight to their store.
  useEffect(() => {
    if (status === "authenticated" && user?.role === "OWNER") {
      router.replace("/dashboard")
    }
  }, [status, user, router])

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="flex items-center justify-between px-5 sm:px-8 py-4">
        <BrandMark className="text-2xl" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login">
            <Button variant="secondary" size="sm">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 sm:pt-16 pb-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-3 py-1 text-xs font-medium text-muted-foreground mb-5">
              <Smartphone className="size-3.5" />
              Works offline · installs like a native app
            </span>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-balance">
              Run your kirana store online
            </h1>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto text-pretty">
              Manage your products, aisles, featured shelf and coupons — all from
              your phone. Install the Kirana Owner app to get started.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <InstallAppButton
                appName="Kirana Owner"
                label="Install the app"
                className="w-full sm:w-auto"
              />
              {isAuthed ? (
                <Link href="/dashboard" className="w-full sm:w-auto">
                  <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                    Go to dashboard
                  </Button>
                </Link>
              ) : (
                <Link href="/signup" className="w-full sm:w-auto">
                  <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                    Apply to open a store
                  </Button>
                </Link>
              )}
            </div>

            {!isAuthed && (
              <p className="mt-5 text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-foreground underline decoration-primary decoration-2 underline-offset-4"
                >
                  Sign in
                </Link>
              </p>
            )}
          </motion.div>
        </section>

        {/* Features */}
        <section className="max-w-5xl mx-auto px-5 sm:px-8 pb-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-[var(--radius-md)] border border-border bg-card p-5"
              >
                <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <f.icon className="size-5" />
                </div>
                <h3 className="font-semibold mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        Kirana for store owners
      </footer>
    </div>
  )
}

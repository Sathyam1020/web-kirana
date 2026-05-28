"use client"

import { useAuthStore, useIsAuthenticated } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { InstallAppButton } from "@workspace/ui/components/install-app-button"
import { ThemeToggle } from "@workspace/ui/components/theme-toggle"
import { motion } from "motion/react"
import { MapPin, Smartphone, Store, Truck } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { BrandMark } from "@/components/brand-mark"

const FEATURES = [
  {
    icon: Store,
    title: "Shop nearby kiranas",
    body: "Browse stores around you and order daily essentials in a few taps.",
  },
  {
    icon: Truck,
    title: "Quick local delivery",
    body: "Get groceries from your neighbourhood store delivered to your door.",
  },
  {
    icon: MapPin,
    title: "Always local",
    body: "We only show stores that actually deliver to your location.",
  },
]

export default function CustomerLandingPage() {
  const router = useRouter()
  const isAuthed = useIsAuthenticated()
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)

  // Signed-in shoppers skip the marketing page and go straight to browsing.
  useEffect(() => {
    if (status === "authenticated" && user?.role === "CUSTOMER") {
      router.replace("/stores")
    }
  }, [status, user, router])

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="flex items-center justify-between px-5 sm:px-8 py-4">
        <BrandMark className="text-2xl" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isAuthed ? (
            <Link href="/account">
              <Button variant="secondary" size="sm">
                Account
              </Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button variant="secondary" size="sm">
                Sign in
              </Button>
            </Link>
          )}
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
              Your neighbourhood store, online
            </h1>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto text-pretty">
              Order groceries and daily essentials from kirana stores around you.
              Install the app for the fastest experience.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <InstallAppButton
                appName="Kirana"
                label="Install the app"
                className="w-full sm:w-auto"
              />
              <Link href="/stores" className="w-full sm:w-auto">
                <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                  Browse stores
                </Button>
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Features */}
        <section className="max-w-5xl mx-auto px-5 sm:px-8 pb-20">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        Kirana · shop local
      </footer>
    </div>
  )
}

"use client"

import { ApiError } from "@workspace/api-client"
import { useApi, useAuthStore } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { motion } from "motion/react"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { BrandMark } from "@/components/brand-mark"
import { describeApiError } from "@/lib/format"

export default function LoginPage() {
  const api = useApi()
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const result = await api.auth.login({ email, password })
      if (result.user.role !== "OWNER") {
        toast.error("This account isn't an owner account")
        setSubmitting(false)
        return
      }
      setUser(result.user)
      router.replace("/")
    } catch (err) {
      if (err instanceof ApiError && err.code === "FORBIDDEN") {
        toast.error("Account is pending admin approval")
        router.replace("/pending")
        return
      }
      toast.error(describeApiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <BrandMark />
      </header>
      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md"
        >
          <Card className="p-8">
            <h1 className="text-3xl font-semibold mb-2">Welcome back</h1>
            <p className="text-muted-foreground mb-8">
              Sign in to your store dashboard.
            </p>
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <Label htmlFor="email" className="mb-2 block">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <div>
                <Label htmlFor="password" className="mb-2 block">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting}
              >
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {submitting ? "Signing in" : "Continue"}
              </Button>
            </form>
            <p className="mt-6 text-sm text-muted-foreground text-center">
              New to Kirana?{" "}
              <Link
                href="/signup"
                className="font-medium text-foreground underline decoration-primary decoration-2 underline-offset-4 hover:decoration-foreground"
              >
                Apply to open a store
              </Link>
            </p>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

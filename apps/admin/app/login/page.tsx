"use client"

import { useApi, useAuthStore } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { motion } from "motion/react"
import { Loader2 } from "lucide-react"
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
      if (result.user.role !== "ADMIN") {
        toast.error("This account isn't an admin")
        setSubmitting(false)
        return
      }
      setUser(result.user)
      router.replace("/")
    } catch (err) {
      toast.error(describeApiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh bg-background flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <Card className="p-8">
          <BrandMark className="mb-6" />
          <h1 className="text-2xl font-semibold mb-1">Sign in</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Admin accounts are seeded. There is no self-signup.
          </p>
          <form onSubmit={onSubmit} className="space-y-4">
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
        </Card>
      </motion.div>
    </div>
  )
}

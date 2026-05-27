"use client"

import { ApiError, PendingApprovalError } from "@workspace/api-client"
import { useApi, useAuthStore } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { PhoneInput } from "@workspace/ui/components/phone-input"
import { composePhone, findDialCode } from "@workspace/ui/lib/phone"
import { motion } from "motion/react"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { BrandMark } from "@/components/brand-mark"
import { describeApiError } from "@/lib/format"

export default function SignupPage() {
  const api = useApi()
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [country, setCountry] = useState("IN")
  const [localPhone, setLocalPhone] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    const dial = findDialCode(country)
    if (localPhone.length < 6) {
      toast.error("Enter your full phone number")
      return
    }
    setSubmitting(true)
    try {
      const result = await api.auth.signup({
        email,
        password,
        name,
        phone: composePhone(dial.dial, localPhone),
        role: "CUSTOMER",
      })
      // Server already set the session cookie via autoSignIn.
      setUser(result.user)
      toast.success(`Welcome, ${result.user.name}`)
      router.replace("/")
    } catch (err) {
      if (err instanceof PendingApprovalError) {
        // Not possible on the customer path, but defensively handle it.
        toast.info("Account created — awaiting approval")
        router.replace("/login")
        return
      }
      if (err instanceof ApiError && err.code === "CONFLICT") {
        toast.error("An account already exists for this email or phone")
      } else {
        toast.error(describeApiError(err))
      }
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
            <h1 className="text-3xl font-semibold mb-2">Create your account</h1>
            <p className="text-muted-foreground mb-8">
              Shop from kiranas around you in a few taps.
            </p>
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <Label htmlFor="name" className="mb-2 block">
                  Your name
                </Label>
                <Input
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={120}
                />
              </div>
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
                <p className="text-xs text-muted-foreground mt-1.5">
                  You&apos;ll log in with this.
                </p>
              </div>
              <div>
                <Label htmlFor="phone" className="mb-2 block">
                  Phone
                </Label>
                <PhoneInput
                  id="phone"
                  value={localPhone}
                  onValueChange={setLocalPhone}
                  countryCode={country}
                  onCountryChange={setCountry}
                  required
                  autoComplete="tel"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  We&apos;ll send you order updates here.
                </p>
              </div>
              <div>
                <Label htmlFor="password" className="mb-2 block">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={128}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  At least 8 characters.
                </p>
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting}
              >
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {submitting ? "Creating account" : "Create account"}
              </Button>
            </form>
            <p className="mt-6 text-sm text-muted-foreground text-center">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-foreground underline decoration-primary decoration-2 underline-offset-4 hover:decoration-foreground"
              >
                Log in
              </Link>
            </p>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

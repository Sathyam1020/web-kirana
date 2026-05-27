"use client"

import { useApi, useAuthStore } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { motion } from "motion/react"
import { Clock, Loader2, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { BrandMark } from "@/components/brand-mark"

const POLL_INTERVAL_MS = 60_000

export default function PendingPage() {
  const api = useApi()
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [checking, setChecking] = useState(false)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function checkApproval() {
    if (!email || !password || checking) return
    setChecking(true)
    try {
      const result = await api.auth.login({ email, password })
      setUser(result.user)
      router.replace("/")
    } catch (err) {
      // still pending or wrong creds — silently keep polling
      void err
    } finally {
      setLastCheck(new Date())
      setChecking(false)
    }
  }

  useEffect(() => {
    if (!email || !password) return
    pollRef.current = setInterval(checkApproval, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password])

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
          <Card className="p-8 text-center">
            <motion.div
              animate={{ rotate: [0, 8, -8, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="size-16 rounded-full bg-muted mx-auto mb-5 inline-flex items-center justify-center"
            >
              <Clock className="size-7 text-muted-foreground" />
            </motion.div>
            <h1 className="text-3xl font-semibold mb-2">Awaiting approval</h1>
            <p className="text-muted-foreground mb-6">
              Our team will review your application and approve you shortly.
              Sign in to check status — we&apos;ll auto-refresh every minute.
            </p>
            <div className="space-y-3 text-left">
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
                  minLength={8}
                />
              </div>
            </div>
            <Button
              onClick={checkApproval}
              className="w-full mt-5"
              disabled={checking || !email || !password}
            >
              {checking ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {checking ? "Checking" : "Check status"}
            </Button>
            {lastCheck && (
              <p className="text-xs text-muted-foreground mt-3 tabular-nums">
                Last checked {lastCheck.toLocaleTimeString()}
              </p>
            )}
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

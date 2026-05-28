"use client"

import { AuthHintProvider, AuthProvider } from "@workspace/auth"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { Toaster } from "sonner"
import { useState } from "react"
import { env } from "@/lib/env"
import { CartSwitchDialog } from "@/components/cart-switch-dialog"
import { RealtimeBridge } from "@/components/realtime-bridge"

export function Providers({
  ssrAuthed,
  children,
}: {
  ssrAuthed: boolean
  children: React.ReactNode
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="kirana-theme"
      disableTransitionOnChange
    >
      <AuthHintProvider ssrAuthed={ssrAuthed}>
        <AuthProvider baseUrl={env.apiUrl}>
          <QueryClientProvider client={queryClient}>
            {children}
            <RealtimeBridge />
            <CartSwitchDialog />
            <Toaster
              position="top-center"
              richColors
              closeButton
              toastOptions={{ className: "rounded-xl" }}
            />
          </QueryClientProvider>
        </AuthProvider>
      </AuthHintProvider>
    </NextThemesProvider>
  )
}

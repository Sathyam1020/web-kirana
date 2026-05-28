import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"

import "@workspace/ui/globals.css"
import { Providers } from "@/components/providers"
import { ServiceWorkerRegister } from "@/components/service-worker-register"
import { readAuthCookieHint } from "@/lib/server-auth"
import { cn } from "@workspace/ui/lib/utils"

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  axes: ["opsz"],
})

export const metadata: Metadata = {
  title: "Kirana",
  description: "Your neighbourhood store, online",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Kirana" },
}

export const viewport: Viewport = {
  themeColor: "#ff385c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ssrAuthed = await readAuthCookieHint()
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", "font-sans", fontSans.variable)}
    >
      <body>
        <Providers ssrAuthed={ssrAuthed}>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}

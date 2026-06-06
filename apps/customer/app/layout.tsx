import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import Script from "next/script"

import "@workspace/ui/globals.css"
import { BackToTop } from "@/components/back-to-top"
import { BottomNav } from "@/components/bottom-nav"
import { CustomerBottomBar } from "@/components/customer-bottom-bar"
import { OfflineBanner } from "@/components/offline-banner"
import { OnboardingSheet } from "@/components/onboarding-sheet"
import { Providers } from "@/components/providers"
import { RouteTransition } from "@/components/route-transition"
import { ServiceWorkerRegister } from "@/components/service-worker-register"
import { readAuthCookieHint } from "@/lib/server-auth"
import { cn } from "@workspace/ui/lib/utils"

// Captures Chrome's beforeinstallprompt BEFORE React hydrates and stashes it
// on window, so the in-app Install button works even if the event fires early
// (common on slow connections / tunnels). useInstallPrompt reads the stash.
const PWA_INSTALL_CAPTURE = `(function(){
  window.__deferredInstallPrompt = window.__deferredInstallPrompt || null;
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    window.__deferredInstallPrompt = e;
    window.dispatchEvent(new Event('installpromptready'));
  });
  window.addEventListener('appinstalled', function(){ window.__deferredInstallPrompt = null; });
})();`

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
        <Script id="pwa-install-capture" strategy="beforeInteractive">
          {PWA_INSTALL_CAPTURE}
        </Script>
        <Providers ssrAuthed={ssrAuthed}>
          <OfflineBanner />
          <RouteTransition>{children}</RouteTransition>
          <BackToTop />
          <CustomerBottomBar />
          <BottomNav />
          {/* IP-6 — one-time post-signup permissions prompt. Hook gates
              by authStatus + a localStorage flag so this only fires
              once per device, for authed customers. */}
          <OnboardingSheet />
        </Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}

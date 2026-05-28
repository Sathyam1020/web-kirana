"use client"

import { Check, Download, Share, SquarePlus } from "lucide-react"
import { useState } from "react"
import { useInstallPrompt } from "@workspace/ui/hooks/use-install-prompt"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Install-the-PWA call to action. Behaviour by platform:
 *   • Chromium (captured beforeinstallprompt) → one-tap native install.
 *   • iOS Safari → opens Share → Add to Home Screen instructions.
 *   • Anything else / prompt not yet captured → generic instructions dialog,
 *     so the button is never a dead end.
 * When already installed it shows a disabled "App installed" state.
 */
export function InstallAppButton({
  label = "Install app",
  appName = "the app",
  className,
  size = "lg",
}: {
  label?: string
  appName?: string
  className?: string
  size?: "default" | "sm" | "lg"
}) {
  const { canInstall, isInstalled, isIOS, promptInstall } = useInstallPrompt()
  const [showHelp, setShowHelp] = useState(false)

  if (isInstalled) {
    return (
      <Button variant="secondary" size={size} className={className} disabled>
        <Check className="size-4" />
        App installed
      </Button>
    )
  }

  async function onClick() {
    if (canInstall) {
      await promptInstall()
      return
    }
    setShowHelp(true)
  }

  return (
    <>
      <Button size={size} className={className} onClick={onClick}>
        <Download className="size-4" />
        {label}
      </Button>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install {appName}</DialogTitle>
            <DialogDescription>
              {isIOS
                ? "Add it to your home screen for a full-screen, app-like experience."
                : "Your browser can add this site to your home screen / apps."}
            </DialogDescription>
          </DialogHeader>

          {isIOS ? (
            <ol className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <Share className="size-5 shrink-0 text-primary" />
                <span>
                  Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
                </span>
              </li>
              <li className="flex items-center gap-3">
                <SquarePlus className="size-5 shrink-0 text-primary" />
                <span>
                  Choose <strong>Add to Home Screen</strong>, then tap{" "}
                  <strong>Add</strong>.
                </span>
              </li>
            </ol>
          ) : (
            <ol className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <SquarePlus className="size-5 shrink-0 text-primary" />
                <span>
                  Open your browser menu and choose <strong>Install app</strong>{" "}
                  (or <strong>Add to Home screen</strong>).
                </span>
              </li>
              <li className="text-muted-foreground">
                On desktop Chrome / Edge, look for the install icon in the address
                bar. Firefox doesn&apos;t support installing web apps.
              </li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

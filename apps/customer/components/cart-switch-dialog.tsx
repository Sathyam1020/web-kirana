"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { useCart } from "@/lib/cart"

export function CartSwitchDialog() {
  const pending = useCart((s) => s.pendingSwitch)
  const cancel = useCart((s) => s.cancelSwitch)
  const confirm = useCart((s) => s.confirmSwitch)

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(o) => {
        if (!o) cancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start a new cart?</AlertDialogTitle>
          <AlertDialogDescription>
            Your cart has items from another store. Adding{" "}
            <span className="font-semibold text-foreground">
              {pending?.pendingProduct.name}
            </span>{" "}
            will clear your current cart and start fresh.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancel}>Keep my cart</AlertDialogCancel>
          <AlertDialogAction onClick={confirm}>Start new cart</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

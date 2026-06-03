"use client"

/**
 * Three-case reorder confirmation:
 *
 *   1. Empty cart — straightforward "Add N items to your cart?"
 *   2. Cart from the SAME store — additive merge "Add to your existing cart?"
 *   3. Cart from a DIFFERENT store — destructive replace, requires a red
 *      "Replace cart" confirm. Matches the design's three-case dialog.
 *
 * Built on the DP-0 BottomSheet so it's reachable from anywhere (orders
 * list / detail) without owning its own positioning. Dispatches the
 * actual bulk-add via a single callback so the cart slice's
 * single-store guarantee stays the source of truth.
 */

import type { OrderItemView, ProductPublicView, Unit } from "@workspace/api-client"
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/ui/components/bottom-sheet"
import { Button } from "@workspace/ui/components/button"
import { AlertTriangle, RefreshCw, ShoppingBag } from "lucide-react"

import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"
import { cn } from "@workspace/ui/lib/utils"

type ReorderableItem = OrderItemView & { productId: string }
function isReorderable(i: OrderItemView): i is ReorderableItem {
  return i.productId !== null
}

function itemToProduct(
  item: ReorderableItem,
  storeId: string,
): ProductPublicView {
  return {
    id: item.productId,
    storeId,
    subcategoryId: "",
    subcategoryName: "",
    categoryId: "",
    categoryName: "",
    departmentId: "",
    departmentName: "",
    name: item.nameSnapshot,
    description: null,
    pricePaise: item.unitPricePaiseSnapshot,
    effectivePricePaise: item.unitPricePaiseSnapshot,
    discountType: null,
    discountValue: null,
    discountValidUntil: null,
    unit: item.unitSnapshot as Unit,
    imageUrl: item.imageUrlSnapshot,
    isAvailable: true,
    isFeatured: false,
    featuredOrder: null,
    // IP-2: reorder dialog shim — the original variant is recovered via
    // OrderItem.variantId at cart-add time. No alternate chips here.
    variants: [],
  }
}

interface ReorderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** All items from the past order being reordered. */
  items: OrderItemView[]
  /** Total of the past order — shown for context. */
  totalPaise: number
  /** Store the past order was placed at. */
  storeId: string
  storeName: string
  /** Optional callback once items have been added to the cart. */
  onConfirmed?: () => void
}

export function ReorderDialog({
  open,
  onOpenChange,
  items,
  totalPaise,
  storeId,
  storeName,
  onConfirmed,
}: ReorderDialogProps) {
  const cart = useCart()
  const reorderable = items.filter(isReorderable)
  const itemCount = reorderable.length
  const droppedCount = items.length - itemCount

  // Determine which of the three cases applies — based on cart at open time,
  // re-read each render so the dialog stays in sync if the user mutates the
  // cart elsewhere mid-sheet.
  const currentCartStoreId = cart.storeId
  const currentCartItems = cart.totalItems()
  const cartEmpty = currentCartItems === 0
  const cartSameStore = currentCartStoreId === storeId && currentCartItems > 0
  const cartDifferentStore =
    currentCartStoreId !== null &&
    currentCartStoreId !== storeId &&
    currentCartItems > 0

  function performBulkAdd() {
    // If cart belongs to a different store, clear it first so the
    // single-store guard in cart.inc doesn't reject the second item with
    // the pendingSwitch dialog.
    if (cartDifferentStore) cart.clear()
    for (const item of reorderable) {
      const product = itemToProduct(item, storeId)
      for (let q = 0; q < item.quantity; q++) {
        cart.inc(product, storeId, storeName)
      }
    }
    onOpenChange(false)
    onConfirmed?.()
  }

  if (reorderable.length === 0 && open) {
    // Past order's items all deleted server-side — show a brief disabled
    // state. Keeps callers from showing a misleading "Reorder" tap that
    // does nothing.
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange}>
        <BottomSheetContent>
          <BottomSheetHeader>
            <BottomSheetTitle>Can&rsquo;t reorder this</BottomSheetTitle>
          </BottomSheetHeader>
          <div className="px-6 pb-6 pt-2 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              The items from this order are no longer available. Browse{" "}
              {storeName} for fresh options.
            </p>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              OK
            </Button>
          </div>
        </BottomSheetContent>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>
            {cartDifferentStore
              ? "Replace your current cart?"
              : cartSameStore
                ? `Add ${itemCount} item${itemCount === 1 ? "" : "s"} to your cart`
                : `Add ${itemCount} item${itemCount === 1 ? "" : "s"} from ${storeName}`}
          </BottomSheetTitle>
        </BottomSheetHeader>

        <div className="px-6 pb-2 space-y-3">
          {cartDifferentStore ? (
            <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] bg-destructive/10 border border-destructive/30 px-3 py-2.5">
              <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" aria-hidden />
              <p className="text-xs text-foreground">
                Your cart has items from a different store. Adding from{" "}
                <span className="font-semibold">{storeName}</span> will clear
                your current cart.
              </p>
            </div>
          ) : null}

          <div className="rounded-[var(--radius-md)] border border-border bg-card px-3 py-2.5 flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
              <ShoppingBag className="size-4 text-primary" aria-hidden />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">
                {itemCount} item{itemCount === 1 ? "" : "s"} from {storeName}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total{" "}
                <span className="tabular-nums">
                  {formatPriceFromPaise(totalPaise)}
                </span>
              </p>
            </div>
          </div>

          {droppedCount > 0 ? (
            <p className="text-[11px] text-warning-foreground">
              {droppedCount} item{droppedCount === 1 ? " is" : "s are"} no longer
              available and won&rsquo;t be re-added.
            </p>
          ) : null}
        </div>

        <div className="border-t border-border-soft px-6 py-4 mt-2 flex flex-col gap-2">
          <Button
            variant={cartDifferentStore ? "destructive" : "default"}
            onClick={performBulkAdd}
            className={cn("w-full")}
          >
            <RefreshCw className="size-4" />
            {cartDifferentStore
              ? "Replace cart"
              : cartEmpty
                ? "Add to cart"
                : "Add to existing cart"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}

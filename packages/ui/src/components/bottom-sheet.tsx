"use client"

/**
 * Bottom sheet primitive — the customer app's go-to surface for cart, deliver-to
 * picker, address picker, slot picker, variant selector, logout confirm.
 *
 * Built on `vaul` (Vercel's drag library) so we inherit best-in-class drag
 * physics, snap points, keyboard handling, and overscroll behavior. Wrapped
 * with our system tokens so consumers don't see vaul directly.
 *
 * Usage:
 *   <BottomSheet open={open} onOpenChange={setOpen}>
 *     <BottomSheetContent>
 *       <BottomSheetHeader>
 *         <BottomSheetTitle>Choose delivery slot</BottomSheetTitle>
 *       </BottomSheetHeader>
 *       <div className="px-6 pb-6">…</div>
 *     </BottomSheetContent>
 *   </BottomSheet>
 */

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@workspace/ui/lib/utils"

const BottomSheet = DrawerPrimitive.Root
const BottomSheetTrigger = DrawerPrimitive.Trigger
const BottomSheetClose = DrawerPrimitive.Close
const BottomSheetPortal = DrawerPrimitive.Portal

function BottomSheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="bottom-sheet-overlay"
      className={cn("fixed inset-0 z-50 bg-foreground/40", className)}
      {...props}
    />
  )
}

interface BottomSheetContentProps
  extends React.ComponentProps<typeof DrawerPrimitive.Content> {
  /**
   * Render the small drag handle at the top of the sheet. Default: true.
   * Hide it when the sheet is a confirm dialog or has its own header chrome.
   */
  showHandle?: boolean
}

function BottomSheetContent({
  className,
  children,
  showHandle = true,
  ...props
}: BottomSheetContentProps) {
  return (
    <BottomSheetPortal>
      <BottomSheetOverlay />
      <DrawerPrimitive.Content
        data-slot="bottom-sheet-content"
        className={cn(
          // Pin to bottom, full width on mobile, capped + centered on desktop.
          "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[var(--radius-lg)]",
          "bg-card text-card-foreground shadow-card",
          // Vaul handles open/close transforms; we just style.
          // Cap height so very tall content scrolls inside the sheet.
          "max-h-[92svh]",
          "mx-auto sm:max-w-md",
          className,
        )}
        {...props}
      >
        {showHandle ? (
          <div
            aria-hidden
            className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border-strong"
          />
        ) : null}
        {children}
      </DrawerPrimitive.Content>
    </BottomSheetPortal>
  )
}

function BottomSheetHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bottom-sheet-header"
      className={cn("flex flex-col gap-1 px-6 pt-4 pb-3", className)}
      {...props}
    />
  )
}

function BottomSheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="bottom-sheet-title"
      className={cn(
        "text-[20px] font-medium leading-[1.2] tracking-[-0.4px] text-foreground",
        className,
      )}
      {...props}
    />
  )
}

function BottomSheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="bottom-sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function BottomSheetFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bottom-sheet-footer"
      className={cn(
        // Sticky-feeling footer for action bars. Keep a subtle separator.
        "mt-auto flex flex-col gap-2 border-t border-border-soft px-6 py-4",
        className,
      )}
      {...props}
    />
  )
}

export {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetClose,
  BottomSheetPortal,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetFooter,
}

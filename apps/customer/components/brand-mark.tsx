import { cn } from "@workspace/ui/lib/utils"
import Image from "next/image"

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-3xl font-bold tracking-tight text-primary",
        className,
      )}
    >
      {/* h-[1em]/w-[1em] makes the storefront glyph track the wordmark's
          font-size, so BrandMark stays balanced at every size it's used. */}
      <Image
        src="/logo.png"
        alt=""
        width={128}
        height={128}
        priority
        aria-hidden
        className="h-[1em] w-[1em]"
      />
      <span>
        kirana<span className="text-foreground">.</span>
      </span>
    </span>
  )
}

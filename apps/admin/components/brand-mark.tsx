import { cn } from "@workspace/ui/lib/utils"
import Image from "next/image"

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-2xl font-bold tracking-tight text-primary",
        className,
      )}
    >
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
        kirana<span className="text-foreground">/admin</span>
      </span>
    </span>
  )
}

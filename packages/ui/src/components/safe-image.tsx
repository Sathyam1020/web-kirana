"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

interface SafeImageProps {
  src: string | null | undefined
  alt: string
  className?: string
  containerClassName?: string
  fallback?: React.ReactNode
  /** Forwarded to <img loading=…/>. Default lazy. */
  loading?: "eager" | "lazy"
}

/**
 * Image renderer that doesn't go through next/image's optimizer (so
 * user-pasted hosts work without preconfigured remotePatterns), but adds
 * graceful fallback when the URL fails to load. Uses <img> with explicit
 * width/height-from-CSS to avoid CLS.
 */
export function SafeImage({
  src,
  alt,
  className,
  containerClassName,
  fallback,
  loading = "lazy",
}: SafeImageProps) {
  const [errored, setErrored] = React.useState(false)
  const trimmed = typeof src === "string" ? src.trim() : ""
  const isValid =
    trimmed.length > 0 &&
    (trimmed.startsWith("http://") || trimmed.startsWith("https://"))

  if (!isValid || errored) {
    return (
      <div
        className={cn(
          "size-full flex items-center justify-center text-muted-foreground",
          containerClassName,
        )}
      >
        {fallback}
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={trimmed}
      alt={alt}
      loading={loading}
      onError={() => setErrored(true)}
      className={cn("size-full object-cover", className)}
    />
  )
}

"use client"

/**
 * Progressive image with blur-up + fade-in. Intentionally NOT using
 * `next/image` because the app loads user-pasted Cloudinary URLs and we
 * don't want to maintain remotePatterns for every kirana that signs up.
 *
 * Sibling to `SafeImage` — this one adds the design-system polish
 * (placeholder fade, motion-aware reveal). New DP-1+ surfaces use this;
 * older callsites can keep using `SafeImage`.
 *
 * Always pass `aspect` (Tailwind class like `aspect-square` or
 * `aspect-[4/3]`) so the placeholder reserves the correct height — never
 * fall back to intrinsic image dims because that causes CLS during load.
 */

import * as React from "react"
import { motion } from "motion/react"

import { cn } from "@workspace/ui/lib/utils"
import { tweens, useMotionPreset } from "@workspace/ui/lib/motion"

interface ProgressiveImageProps {
  src: string | null | undefined
  alt: string
  /**
   * Tailwind aspect-ratio class. Required to prevent CLS while the image
   * loads. Common picks: `aspect-square`, `aspect-[4/3]`, `aspect-[16/9]`.
   */
  aspect: string
  /**
   * Optional rounded corners on the OUTER frame. Default uses the card
   * radius — pass `rounded-full` for avatars, `rounded-none` to opt out.
   */
  rounded?: string
  /** Forwarded to `<img loading=...>`. Default lazy. */
  loading?: "eager" | "lazy"
  /** Fallback rendered when src is missing or fails to load. */
  fallback?: React.ReactNode
  /** Class applied to the OUTER frame (sizing, position). */
  className?: string
  /** Class applied to the INNER `<img>` (object-fit, etc.). */
  imageClassName?: string
}

function ProgressiveImage({
  src,
  alt,
  aspect,
  rounded = "rounded-[var(--radius-md)]",
  loading = "lazy",
  fallback,
  className,
  imageClassName,
}: ProgressiveImageProps) {
  const [loaded, setLoaded] = React.useState(false)
  const [errored, setErrored] = React.useState(false)

  const fadeIn = useMotionPreset(tweens.fast)

  const trimmed = typeof src === "string" ? src.trim() : ""
  const isValid =
    trimmed.length > 0 &&
    (trimmed.startsWith("http://") || trimmed.startsWith("https://"))

  // Reset internal state when the source changes (image swap).
  React.useEffect(() => {
    setLoaded(false)
    setErrored(false)
  }, [trimmed])

  if (!isValid || errored) {
    return (
      <div
        className={cn(
          aspect,
          rounded,
          "relative overflow-hidden bg-surface-soft",
          "flex items-center justify-center text-muted-foreground",
          className,
        )}
      >
        {fallback}
      </div>
    )
  }

  return (
    <div
      className={cn(
        aspect,
        rounded,
        "relative overflow-hidden bg-surface-soft",
        className,
      )}
    >
      {/* Subtle placeholder shimmer — visible only until the image loads. */}
      {!loaded ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-surface-soft to-surface-strong"
        />
      ) : null}

      <motion.img
        // eslint-disable-next-line @next/next/no-img-element -- intentional, see file header.
        src={trimmed}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        initial={{ opacity: 0 }}
        animate={{ opacity: loaded ? 1 : 0 }}
        transition={fadeIn}
        className={cn(
          "absolute inset-0 size-full object-cover",
          imageClassName,
        )}
      />
    </div>
  )
}

export { ProgressiveImage }
export type { ProgressiveImageProps }

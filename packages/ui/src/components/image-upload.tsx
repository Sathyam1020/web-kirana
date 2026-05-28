"use client"

import { ImagePlus, Loader2, X } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { cn } from "@workspace/ui/lib/utils"

export interface ImageUploadResult {
  url: string
  publicId: string
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024 // 5 MB

/**
 * Presentational image picker for the signed-upload flow. It stays free of any
 * API/auth dependency: the caller passes `onUpload` (typically
 * `(f) => uploadToCloudinary(api, scope, f)`) and receives the resulting
 * { url, publicId } via `onChange`. Passing `null` to onChange clears it.
 */
export function ImageUpload({
  value,
  onChange,
  onUpload,
  label = "Image",
  aspect = "square",
  disabled = false,
  maxBytes = DEFAULT_MAX_BYTES,
  className,
}: {
  value: string | null
  onChange: (result: ImageUploadResult | null) => void
  onUpload: (file: File) => Promise<ImageUploadResult>
  label?: string
  aspect?: "square" | "wide"
  disabled?: boolean
  maxBytes?: number
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.")
      return
    }
    if (file.size > maxBytes) {
      setError(`Image must be under ${Math.round(maxBytes / (1024 * 1024))} MB.`)
      return
    }
    setUploading(true)
    try {
      const result = await onUpload(file)
      onChange(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.")
    } finally {
      setUploading(false)
      // Reset so picking the same file again re-triggers onChange.
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const aspectClass = aspect === "wide" ? "aspect-[16/9]" : "aspect-square"

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <span className="block text-sm font-medium">{label}</span>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {value ? (
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-soft",
            aspect === "wide" ? "max-w-md" : "max-w-[12rem]",
            aspectClass,
          )}
        >
          <SafeImage src={value} alt={label} />
          <div className="absolute inset-x-0 bottom-0 flex justify-between gap-2 p-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={disabled || uploading}
              onClick={() => {
                setError(null)
                onChange(null)
              }}
              aria-label="Remove image"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed border-border bg-surface-soft text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60",
            aspect === "wide" ? "max-w-md aspect-[16/9]" : "max-w-[12rem] aspect-square",
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="size-6 animate-spin" />
              <span className="text-xs">Uploading…</span>
            </>
          ) : (
            <>
              <ImagePlus className="size-6" />
              <span className="text-xs font-medium">Upload image</span>
            </>
          )}
        </button>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

"use client"

import { uploadToCloudinary, type StoreBanner, type StoreOwnerView } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ImageUpload, type ImageUploadResult } from "@workspace/ui/components/image-upload"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Image as ImageIcon, Loader2, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { describeApiError } from "@/lib/format"

export default function SettingsPage() {
  const api = useApi()
  const queryClient = useQueryClient()

  const storeQuery = useQuery({
    queryKey: ["stores", "me"],
    queryFn: () => api.stores.getMine(),
  })
  const bannersQuery = useQuery({
    queryKey: ["banners", "me"],
    queryFn: () => api.stores.listBanners(),
  })

  const store = storeQuery.data

  // --- Store cover -------------------------------------------------------
  const coverMutation = useMutation({
    mutationFn: (result: ImageUploadResult | null) =>
      api.stores.updateMine({
        imageUrl: result?.url ?? null,
        imagePublicId: result?.publicId ?? null,
      }),
    onSuccess: (next: StoreOwnerView) => {
      queryClient.setQueryData(["stores", "me"], next)
      toast.success("Store cover updated")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  // --- Banners -----------------------------------------------------------
  const [newName, setNewName] = useState("")
  const [newImage, setNewImage] = useState<ImageUploadResult | null>(null)

  const createBanner = useMutation({
    mutationFn: () =>
      api.stores.createBanner({
        name: newName.trim(),
        imageUrl: newImage!.url,
        imagePublicId: newImage!.publicId,
      }),
    onSuccess: () => {
      setNewName("")
      setNewImage(null)
      void queryClient.invalidateQueries({ queryKey: ["banners", "me"] })
      toast.success("Banner added")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const setActive = useMutation({
    mutationFn: (bannerId: string | null) => api.stores.setActiveBanner(bannerId),
    onSuccess: (banners: StoreBanner[]) => {
      queryClient.setQueryData(["banners", "me"], banners)
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const removeBanner = useMutation({
    mutationFn: (id: string) => api.stores.removeBanner(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["banners", "me"] })
      toast.success("Banner removed")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const banners = bannersQuery.data ?? []
  const hasActive = banners.some((b) => b.isActive)
  const canAdd = newName.trim().length > 0 && newImage !== null && !createBanner.isPending

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Store settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your cover image and promotional banners.
        </p>
      </div>

      {/* Store cover */}
      <Card className="p-5 space-y-3">
        <div>
          <h2 className="font-semibold">Store cover</h2>
          <p className="text-sm text-muted-foreground">
            The main image at the top of your store page.
          </p>
        </div>
        {storeQuery.isPending ? (
          <Skeleton className="aspect-[16/9] max-w-md rounded-[var(--radius-md)]" />
        ) : (
          <ImageUpload
            label=""
            aspect="wide"
            value={store?.imageUrl ?? null}
            disabled={coverMutation.isPending}
            onUpload={(file) => uploadToCloudinary(api, "store", file)}
            onChange={(result) => coverMutation.mutate(result)}
          />
        )}
      </Card>

      {/* Banners */}
      <Card className="p-5 space-y-5">
        <div>
          <h2 className="font-semibold">Promotional banners</h2>
          <p className="text-sm text-muted-foreground">
            Upload banners and switch the active one anytime. The active banner
            shows at the top of your store page.
          </p>
        </div>

        {/* Add a new banner */}
        <div className="rounded-[var(--radius-md)] border border-dashed border-border p-4 space-y-3">
          <div>
            <Label htmlFor="banner-name" className="mb-1.5 block">
              Banner name
            </Label>
            <Input
              id="banner-name"
              placeholder="e.g. Diwali 50% off"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={80}
            />
          </div>
          <ImageUpload
            label="Banner image"
            aspect="wide"
            value={newImage?.url ?? null}
            onUpload={(file) => uploadToCloudinary(api, "banner", file)}
            onChange={(result) => setNewImage(result)}
          />
          <Button onClick={() => createBanner.mutate()} disabled={!canAdd}>
            {createBanner.isPending && <Loader2 className="size-4 animate-spin" />}
            Add banner
          </Button>
        </div>

        {/* Existing banners */}
        {bannersQuery.isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-[var(--radius-md)]" />
            ))}
          </div>
        ) : banners.length === 0 ? (
          <EmptyState
            icon={<ImageIcon className="size-5" />}
            title="No banners yet"
            description="Add your first promotional banner above."
          />
        ) : (
          <div className="space-y-3">
            {hasActive && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActive.mutate(null)}
                disabled={setActive.isPending}
              >
                Hide active banner
              </Button>
            )}
            {banners.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border p-3"
              >
                <div className="w-24 aspect-[16/9] shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-soft">
                  <SafeImage src={b.imageUrl} alt={b.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{b.name}</p>
                  {b.isActive && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-0.5">
                      <Check className="size-3" /> Active
                    </span>
                  )}
                </div>
                {b.isActive ? (
                  <span className="text-xs text-muted-foreground px-2">Showing</span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setActive.mutate(b.id)}
                    disabled={setActive.isPending}
                  >
                    Set active
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${b.name}`}
                  onClick={() => removeBanner.mutate(b.id)}
                  disabled={removeBanner.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

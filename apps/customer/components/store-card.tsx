"use client"

import { Badge } from "@workspace/ui/components/badge"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { formatDistance, formatPriceFromPaise } from "@/lib/format"
import type { StoreNearbyHit } from "@workspace/api-client"
import Link from "next/link"
import { motion } from "motion/react"
import { MapPin, Store as StoreIcon } from "lucide-react"

export function StoreCard({ store }: { store: StoreNearbyHit }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      <Link
        href={`/stores/${store.id}`}
        className="flex h-full flex-col rounded-[var(--radius-md)] bg-card border border-border overflow-hidden hover:shadow-md transition-shadow"
      >
        <div className="aspect-[16/9] bg-muted relative overflow-hidden shrink-0">
          <SafeImage
            src={store.imageUrl}
            alt={store.name}
            fallback={<StoreIcon className="size-10" />}
          />
          <div className="absolute top-3 left-3 flex gap-2">
            {store.isOpen ? (
              <Badge variant="success">
                <span className="inline-block size-1.5 rounded-full bg-current mr-1.5" />
                Open
              </Badge>
            ) : (
              <Badge variant="muted">Closed</Badge>
            )}
          </div>
          <div className="absolute top-3 right-3">
            <Badge variant="default" className="tabular-nums">
              {formatDistance(store.distanceMeters)}
            </Badge>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-base truncate">{store.name}</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="size-3" />
                {store.city}
              </p>
            </div>
          </div>
          {/* Reserve the minOrder slot so cards keep the same height
              whether or not the store sets a minimum. */}
          <p className="text-xs text-muted-foreground mt-2 min-h-4">
            {store.minOrderPaise > 0 ? (
              <>
                Min order{" "}
                <span className="tabular-nums text-foreground">
                  {formatPriceFromPaise(store.minOrderPaise)}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </Link>
    </motion.div>
  )
}

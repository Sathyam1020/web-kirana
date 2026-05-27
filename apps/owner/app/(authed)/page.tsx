"use client"

import { useApi } from "@workspace/auth"
import { Card } from "@workspace/ui/components/card"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { Package, ShoppingBag, Star, Ticket, TrendingUp } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"

export default function TodayPage() {
  const api = useApi()

  const products = useQuery({
    queryKey: ["products", "me", "count"],
    queryFn: () => api.products.list({ limit: 100, includeInactive: true }),
  })

  const coupons = useQuery({
    queryKey: ["coupons", "owner"],
    queryFn: () => api.coupons.ownerList(),
  })

  const productCount = products.data?.items.length ?? 0
  const activeProducts = products.data?.items.filter((p) => p.isActive).length ?? 0
  const featured = products.data?.items.filter((p) => p.isFeatured).length ?? 0
  const isPending = products.isPending || coupons.isPending
  const anyError = products.isError || coupons.isError

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-semibold">Today</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Orders will appear here when we launch ordering. For now, here&apos;s your catalog at a glance.
        </p>
      </div>

      {anyError && (
        <ErrorState
          title="Couldn't load your stats"
          description="The catalog and coupon counts didn't load. Try again."
          retry={() => {
            void products.refetch()
            void coupons.refetch()
          }}
        />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          icon={Package}
          label="Active products"
          value={isPending ? null : `${activeProducts}/${productCount}`}
          href="/products"
        />
        <Stat
          icon={Star}
          label="Featured"
          value={isPending ? null : String(featured)}
          href="/featured"
        />
        <Stat
          icon={Ticket}
          label="Coupons"
          value={
            coupons.isPending ? null : String(coupons.data?.items.length ?? 0)
          }
          href="/coupons"
        />
        <Stat
          icon={TrendingUp}
          label="Orders today"
          value="—"
          hint="Coming soon"
        />
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <span className="size-10 rounded-full bg-muted inline-flex items-center justify-center">
            <ShoppingBag className="size-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Orders are on the way</h2>
            <p className="text-sm text-muted-foreground mt-1">
              We&apos;re finalising ordering and delivery. While we get that
              ready, keep your catalog fresh and your coupons running.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  href,
  hint,
}: {
  icon: LucideIcon
  label: string
  /** null while loading — renders a skeleton instead of the number. */
  value: string | null
  href?: string
  hint?: string
}) {
  const content = (
    <Card className="p-4 h-full">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
        <Icon className="size-3.5" />
        {label}
      </div>
      {value === null ? (
        <Skeleton className="h-8 w-16 mt-2" />
      ) : (
        <p className="tabular-nums text-2xl font-semibold mt-2">{value}</p>
      )}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </Card>
  )
  if (href) {
    return (
      <Link href={href} className="block hover:opacity-90 transition-opacity">
        {content}
      </Link>
    )
  }
  return content
}

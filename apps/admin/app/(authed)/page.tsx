"use client"

import { useApi } from "@workspace/auth"
import { Card } from "@workspace/ui/components/card"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import {
  Activity,
  Sparkles,
  TicketPercent,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  const api = useApi()

  const pending = useQuery({
    queryKey: ["admin", "pendingOwners"],
    queryFn: () => api.admin.pendingOwners(),
  })

  const coupons = useQuery({
    queryKey: ["admin", "coupons"],
    queryFn: () => api.coupons.adminList(),
  })

  const anyError = pending.isError || coupons.isError

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Marketplace</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Stores, owners, coupons & promotions. Orders KPIs land with Phase 7.
        </p>
      </header>

      {anyError && (
        <ErrorState
          title="Couldn't load marketplace stats"
          description="One or more queries failed. Try again."
          retry={() => {
            void pending.refetch()
            void coupons.refetch()
          }}
        />
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          icon={Users}
          label="Pending owners"
          value={
            pending.isPending ? null : String(pending.data?.length ?? 0)
          }
          href="/owners"
        />
        <Stat
          icon={TicketPercent}
          label="Global coupons"
          value={
            coupons.isPending ? null : String(coupons.data?.items.length ?? 0)
          }
          href="/coupons"
        />
        <Stat
          icon={Sparkles}
          label="Promoted products"
          value="—"
          hint="Manage via Promotions"
          href="/promotions"
        />
        <Stat
          icon={Activity}
          label="Orders today"
          value="—"
          hint="Coming soon"
        />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Recent activity</h2>
        <Card className="p-6 text-sm text-muted-foreground">
          Activity feed is coming with Phase 8. Until then, use the navigation
          on the left to manage marketplace state.
        </Card>
      </section>
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
  const body = (
    <Card className="p-5 h-full hover:shadow-lg transition-shadow">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
        <Icon className="size-3.5" />
        {label}
      </div>
      {value === null ? (
        <Skeleton className="h-9 w-16 mt-2" />
      ) : (
        <p className="tabular-nums text-3xl font-semibold mt-2">{value}</p>
      )}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </Card>
  )
  if (href) {
    return <Link href={href}>{body}</Link>
  }
  return body
}

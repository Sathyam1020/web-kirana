"use client"

import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ProductForm } from "@/components/product-form"

export default function EditProductPage() {
  const api = useApi()
  const params = useParams<{ id: string }>()
  const id = params.id

  const product = useQuery({
    queryKey: ["products", "me", id],
    queryFn: () => api.products.get(id),
    enabled: typeof id === "string" && id.length > 0,
  })

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/products" aria-label="Back">
          <Button variant="secondary" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold">Edit product</h1>
      </div>
      {product.isPending && (
        <Card className="p-6 space-y-4">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </Card>
      )}
      {product.isError && (
        <ErrorState
          title="Couldn't load this product"
          description="It may have been removed, or the request failed. Try again."
          retry={() => product.refetch()}
        />
      )}
      {product.data && <ProductForm product={product.data} />}
    </div>
  )
}

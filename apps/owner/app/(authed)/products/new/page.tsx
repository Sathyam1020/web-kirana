"use client"

import { Button } from "@workspace/ui/components/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { ProductForm } from "@/components/product-form"

export default function NewProductPage() {
  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/products" aria-label="Back">
          <Button variant="secondary" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold">New product</h1>
      </div>
      <ProductForm />
    </div>
  )
}

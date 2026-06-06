import { join, sql, type Sql } from "@prisma/client-runtime-utils"
import { prisma } from "../../db/prisma.js"
import type { DiscountType, Unit } from "../../generated/prisma/enums.js"
import { ValidationError } from "../../lib/errors.js"
import { effectiveVariantPricePaise } from "../../lib/pricing.js"

/**
 * Hybrid scoring: FTS rank, trigram similarity, alias exact match, and
 * substring match. We use GREATEST() so a strong signal dominates rather
 * than dilute via weighted sum — exact alias match (0.9) beats a weak FTS
 * rank (0.2), for example.
 *
 * Filters that the customer (or owner-self search) can apply:
 *   - storeId: scope to one store
 *   - categoryId: scope to one category
 *   - lat/lng/radius: geo bounding (PostGIS), only Open + Active stores
 *
 * `ownerScope` is set internally by the owner self-search route so the
 * owner sees their own inactive/unavailable products too. The customer
 * endpoint never sets it.
 */

/**
 * IP-2 — variant payload on each hit. Matches the public-view shape
 * exposed via `toPublicProductView` so search-result product cards
 * exercise the same multi-variant trigger as the home-rail cards.
 */
export interface SearchHitVariant {
  id: string
  name: string
  unitValue: string
  unit: Unit
  pricePaise: number
  effectivePricePaise: number
  isAvailable: boolean
  isDefault: boolean
  sortOrder: number
  imageUrl: string | null
}

export interface SearchHit {
  id: string
  storeId: string
  storeName: string
  // Phase 6.6: full taxonomy chain on every hit so the FE can render
  // breadcrumbs / facets without an extra round-trip.
  subcategoryId: string
  subcategoryName: string
  categoryId: string
  categoryName: string
  departmentId: string
  departmentName: string
  name: string
  description: string | null
  pricePaise: number
  unit: Unit
  imageUrl: string | null
  isAvailable: boolean
  isActive: boolean
  /** IP-2 — sized SKUs. Always ≥1 for IP-2+ products. */
  variants: SearchHitVariant[]
  /** Hybrid score in [0, 1+] range. Higher = better. */
  score: number
}

export interface SearchResult {
  items: SearchHit[]
  page: number
  limit: number
  hasMore: boolean
}

export interface SearchOpts {
  q: string
  page?: number
  limit?: number
  storeId?: string
  /** Phase 6.6: L2 — filter via subcategory.categoryId JOIN. */
  categoryId?: string
  /** Phase 6.6: L3 — direct filter on the new FK. */
  subcategoryId?: string
  /** Geo filter (all three required together) */
  lat?: number
  lng?: number
  radiusMeters?: number
  /**
   * Owner-self scope. When set, results include inactive/unavailable
   * products AND skip the store-open/active filter so the owner can find
   * anything in their own catalog. The query is also forcibly scoped to
   * this store.
   */
  ownerScope?: { storeId: string }
}

interface RawHit {
  id: string
  storeId: string
  storeName: string
  subcategoryId: string
  subcategoryName: string
  categoryId: string
  categoryName: string
  departmentId: string
  departmentName: string
  name: string
  description: string | null
  pricePaise: number
  unit: Unit
  imageUrl: string | null
  isAvailable: boolean
  isActive: boolean
  // IP-2 — needed to compute per-variant effectivePricePaise after the
  // variants follow-up query. Same discount fields the public view path
  // pulls from Product (per-variant discount is deferred).
  discountType: DiscountType | null
  discountValue: number | null
  discountValidUntil: Date | null
  score: number
}

function normalizeQueryString(q: string): string {
  // Lowercase + trim. Trigram + tsquery already case-insensitive after
  // unaccent, but `searchAliases @> ARRAY[q]` is a literal match so we
  // lowercase here to match how aliases were stored.
  return q.trim().toLowerCase()
}

export async function searchProducts(opts: SearchOpts): Promise<SearchResult> {
  const q = normalizeQueryString(opts.q)
  const page = opts.page ?? 1
  const limit = opts.limit ?? 20
  const offset = (page - 1) * limit

  const hasGeo =
    opts.lat !== undefined && opts.lng !== undefined && opts.radiusMeters !== undefined
  const someGeo =
    opts.lat !== undefined || opts.lng !== undefined || opts.radiusMeters !== undefined
  if (someGeo && !hasGeo) {
    throw new ValidationError("lat, lng, and radiusMeters must be supplied together")
  }

  // SQL is built up via sql template fragments so user input is
  // always parameterised.
  const conditions: Sql[] = []

  if (opts.ownerScope !== undefined) {
    // Owner sees everything in their own store, including inactive/unavailable.
    conditions.push(sql`p."storeId" = ${opts.ownerScope.storeId}`)
  } else {
    // Customer-facing path: only open + active stores, only active + available products.
    conditions.push(sql`p."isActive" = true`)
    conditions.push(sql`p."isAvailable" = true`)
    conditions.push(sql`s."isActive" = true`)
    conditions.push(sql`s."isOpen" = true`)
  }

  if (opts.storeId !== undefined) {
    conditions.push(sql`p."storeId" = ${opts.storeId}`)
  }
  if (opts.subcategoryId !== undefined) {
    conditions.push(sql`p."subcategoryId" = ${opts.subcategoryId}`)
  }
  if (opts.categoryId !== undefined) {
    // L2 filter — JOIN through Subcategory.categoryId.
    conditions.push(sql`sc."categoryId" = ${opts.categoryId}`)
  }
  if (!opts.ownerScope) {
    // Customer-facing path also drops products whose subcategory has
    // been kill-switched by the owner (Phase 6.6 bulk-availability).
    conditions.push(sql`sc."isAvailable" = true`)
  }
  if (hasGeo) {
    conditions.push(sql`s.location IS NOT NULL`)
    conditions.push(
      sql`ST_DWithin(
        s.location,
        ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)::geography,
        ${opts.radiusMeters}
      )`,
    )
  }

  // Text-match leg: any of the four signals must be true so we don't fall
  // through to "score against the whole catalog".
  //
  // `word_similarity(needle, haystack)` is the pg_trgm operator that returns
  // the best trigram-similarity score of `needle` against any contiguous
  // substring of `haystack`. This is what gives us tolerance for typos in
  // long product names — "ata" against "Aashirvaad Atta 5kg" lights up
  // because the best matching token "atta" scores ~0.5 against "ata".
  conditions.push(
    sql`(
         p."searchVector" @@ websearch_to_tsquery('simple', immutable_unaccent(${q}))
      OR word_similarity(immutable_unaccent(${q}), immutable_unaccent(p.name)) > 0.4
      OR p."searchAliases" @> ARRAY[${q}]
      OR p.name ILIKE '%' || ${q} || '%'
    )`,
  )

  const where = join(conditions, " AND ")

  // GREATEST() so the strongest signal wins.
  const scoreExpr = sql`
    GREATEST(
      ts_rank_cd(p."searchVector", websearch_to_tsquery('simple', immutable_unaccent(${q}))) * 1.0,
      word_similarity(immutable_unaccent(${q}), immutable_unaccent(p.name)) * 0.7,
      CASE WHEN p."searchAliases" @> ARRAY[${q}] THEN 0.9 ELSE 0 END,
      CASE WHEN p.name ILIKE '%' || ${q} || '%' THEN 0.5 ELSE 0 END
    )
  `

  // Fetch limit + 1 so we know if there's a next page without a separate COUNT.
  // JOINs traverse Product → Subcategory → Category → Department for the
  // full taxonomy chain (Phase 6.6).
  const query = sql`
    SELECT
      p.id,
      p."storeId",
      s.name AS "storeName",
      p."subcategoryId",
      sc.name AS "subcategoryName",
      sc."categoryId",
      c.name AS "categoryName",
      c."departmentId",
      d.name AS "departmentName",
      p.name,
      p.description,
      p."pricePaise",
      p.unit,
      p."imageUrl",
      p."isAvailable",
      p."isActive",
      p."discountType",
      p."discountValue",
      p."discountValidUntil",
      ${scoreExpr} AS score
    FROM "Product" p
    JOIN "Store"       s  ON s.id  = p."storeId"
    JOIN "Subcategory" sc ON sc.id = p."subcategoryId"
    JOIN "Category"    c  ON c.id  = sc."categoryId"
    JOIN "Department"  d  ON d.id  = c."departmentId"
    WHERE ${where}
    ORDER BY score DESC, p.id ASC
    LIMIT ${limit + 1} OFFSET ${offset}
  `
  const rows = await prisma.$queryRaw<RawHit[]>(query)

  const hasMore = rows.length > limit
  const trimmed = hasMore ? rows.slice(0, limit) : rows

  // IP-2 — second round-trip fetches every hit's variants in one batch
  // and attaches them to each result with effectivePricePaise computed
  // per-variant (product-level discount applied). Skipped when the
  // initial result set is empty.
  const variantsByProductId = new Map<string, SearchHitVariant[]>()
  if (trimmed.length > 0) {
    const ids = trimmed.map((r) => r.id)
    const productById = new Map(trimmed.map((r) => [r.id, r]))
    const variantRows = await prisma.productVariant.findMany({
      where: { productId: { in: ids } },
      select: {
        id: true,
        productId: true,
        name: true,
        unitValue: true,
        unit: true,
        pricePaise: true,
        isAvailable: true,
        isDefault: true,
        sortOrder: true,
        imageUrl: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    })
    for (const v of variantRows) {
      const parent = productById.get(v.productId)
      if (parent === undefined) continue
      const list = variantsByProductId.get(v.productId) ?? []
      list.push({
        id: v.id,
        name: v.name,
        unitValue: String(v.unitValue),
        unit: v.unit,
        pricePaise: v.pricePaise,
        effectivePricePaise: effectiveVariantPricePaise(v, {
          discountType: parent.discountType,
          discountValue: parent.discountValue,
          discountValidUntil: parent.discountValidUntil,
        }),
        isAvailable: v.isAvailable,
        isDefault: v.isDefault,
        sortOrder: v.sortOrder,
        // Variant image with fallback to the product's image — same
        // resolution the public view does at the wire boundary.
        imageUrl: v.imageUrl ?? parent.imageUrl,
      })
      variantsByProductId.set(v.productId, list)
    }
  }

  return {
    items: trimmed.map((row) => ({
      id: row.id,
      storeId: row.storeId,
      storeName: row.storeName,
      subcategoryId: row.subcategoryId,
      subcategoryName: row.subcategoryName,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      departmentId: row.departmentId,
      departmentName: row.departmentName,
      name: row.name,
      description: row.description,
      pricePaise: row.pricePaise,
      unit: row.unit,
      imageUrl: row.imageUrl,
      isAvailable: row.isAvailable,
      isActive: row.isActive,
      variants: variantsByProductId.get(row.id) ?? [],
      score: Number(row.score),
    })),
    page,
    limit,
    hasMore,
  }
}

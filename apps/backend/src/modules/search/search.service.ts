import { join, sql, type Sql } from "@prisma/client-runtime-utils"
import { prisma } from "../../db/prisma.js"
import type { Unit } from "../../generated/prisma/enums.js"
import { ValidationError } from "../../lib/errors.js"

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

export interface SearchHit {
  id: string
  storeId: string
  storeName: string
  categoryId: string
  categoryName: string
  name: string
  description: string | null
  pricePaise: number
  unit: Unit
  imageUrl: string | null
  isAvailable: boolean
  isActive: boolean
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
  categoryId?: string
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
  categoryId: string
  categoryName: string
  name: string
  description: string | null
  pricePaise: number
  unit: Unit
  imageUrl: string | null
  isAvailable: boolean
  isActive: boolean
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
  if (opts.categoryId !== undefined) {
    conditions.push(sql`p."categoryId" = ${opts.categoryId}`)
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
  // Build the full Sql object (composing nested fragments) and pass to
  // $queryRaw — the template-literal form doesn't expand nested Sql.
  const query = sql`
    SELECT
      p.id,
      p."storeId",
      s.name AS "storeName",
      p."categoryId",
      c.name AS "categoryName",
      p.name,
      p.description,
      p."pricePaise",
      p.unit,
      p."imageUrl",
      p."isAvailable",
      p."isActive",
      ${scoreExpr} AS score
    FROM "Product" p
    JOIN "Store"    s ON s.id = p."storeId"
    JOIN "Category" c ON c.id = p."categoryId"
    WHERE ${where}
    ORDER BY score DESC, p.id ASC
    LIMIT ${limit + 1} OFFSET ${offset}
  `
  const rows = await prisma.$queryRaw<RawHit[]>(query)

  const hasMore = rows.length > limit
  const trimmed = hasMore ? rows.slice(0, limit) : rows

  return {
    items: trimmed.map((row) => ({
      id: row.id,
      storeId: row.storeId,
      storeName: row.storeName,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      name: row.name,
      description: row.description,
      pricePaise: row.pricePaise,
      unit: row.unit,
      imageUrl: row.imageUrl,
      isAvailable: row.isAvailable,
      isActive: row.isActive,
      score: Number(row.score),
    })),
    page,
    limit,
    hasMore,
  }
}

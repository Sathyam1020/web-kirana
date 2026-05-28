// Hand-mirrored from backend service view interfaces.
// Source of truth: apps/backend/src/modules/*/*.service.ts

import type { Role } from "./enums"

// --- Auth ---------------------------------------------------------------
// Phase 6.5: session lives in an httpOnly cookie (`kirana.session_token`).
// The FE never holds a token. Successful sign-up / sign-in / get-session
// returns the user, possibly the bare session token (for non-cookie
// integrations), and that's it.

export interface AuthUser {
  id: string
  email: string
  name: string
  phone: string
  role: Role | "ADMIN"
  isApproved: boolean
  emailVerified?: boolean
  image?: string | null
}

/** Response shape for sign-up/email and sign-in/email (better-auth). */
export interface AuthSuccess {
  user: AuthUser
  token: string
}

/** Response shape for get-session when authenticated. */
export interface SessionResult {
  user: AuthUser
  session: {
    id: string
    expiresAt: string
    token: string
    userId: string
  }
}

// --- Taxonomy (Phase 6.6) ----------------------------------------------
//   L1 Department (admin) → L2 Category (admin) → L3 Subcategory (store)
//   → L4 Product (store FK on subcategory)

export interface Department {
  id: string
  name: string
  displayOrder: number
  iconUrl: string | null
  // Cloudinary public_id for iconUrl (Phase 6.7). Internal cleanup handle.
  iconPublicId: string | null
  createdAt: string
}

export interface DepartmentWithCategories extends Department {
  categories: Array<{
    id: string
    name: string
    displayOrder: number
    iconUrl: string | null
  }>
}

export interface Category {
  id: string
  departmentId: string
  name: string
  displayOrder: number
  iconUrl: string | null
  iconPublicId: string | null
  createdAt: string
}

export interface SubcategoryOwnerView {
  id: string
  storeId: string
  categoryId: string
  name: string
  displayOrder: number
  isAvailable: boolean
  productCount: number
  createdAt: string
  updatedAt: string
}

export interface SubcategoryPublicView {
  id: string
  categoryId: string
  name: string
  displayOrder: number
  productCount: number
}

// --- Stores -------------------------------------------------------------

export interface StoreOwnerView {
  id: string
  ownerId: string
  name: string
  description: string | null
  phone: string
  isActive: boolean
  isOpen: boolean
  latitude: string
  longitude: string
  deliveryRadiusMeters: number
  minOrderPaise: number
  addressLine: string
  city: string
  pincode: string
  imageUrl: string | null
  imagePublicId: string | null
  createdAt: string
  updatedAt: string
}

export interface StorePublicView {
  id: string
  name: string
  description: string | null
  phone: string
  isOpen: boolean
  latitude: string
  longitude: string
  deliveryRadiusMeters: number
  minOrderPaise: number
  addressLine: string
  city: string
  pincode: string
  imageUrl: string | null
  createdAt: string
}

export interface StoreNearbyHit extends StorePublicView {
  distanceMeters: number
}

export interface NearbyResult {
  items: StoreNearbyHit[]
  page: number
  limit: number
  hasMore: boolean
}

// --- Products -----------------------------------------------------------

export type Unit = "KG" | "G" | "L" | "ML" | "PIECE" | "PACK" | "DOZEN"

/** Phase 6.8 — per-product discount type. */
export type DiscountType = "PERCENT" | "FLAT_PAISE"

export const UNIT_LABELS: Record<Unit, string> = {
  KG: "kg",
  G: "g",
  L: "L",
  ML: "ml",
  PIECE: "piece",
  PACK: "pack",
  DOZEN: "dozen",
}

/**
 * Phase 6.6 — product views carry the full taxonomy chain (L1+L2+L3) so
 * tile UI can render breadcrumbs without an extra round-trip.
 */
export interface ProductOwnerView {
  id: string
  storeId: string
  subcategoryId: string
  subcategoryName: string
  categoryId: string
  categoryName: string
  departmentId: string
  departmentName: string
  name: string
  description: string | null
  pricePaise: number
  // Phase 6.8 — price after an active discount (== pricePaise if none).
  effectivePricePaise: number
  discountType: DiscountType | null
  discountValue: number | null
  discountValidUntil: string | null
  unit: Unit
  imageUrl: string | null
  imagePublicId: string | null
  isActive: boolean
  isAvailable: boolean
  isFeatured: boolean
  featuredOrder: number | null
  isPromoted: boolean
  promotedUntil: string | null
  searchAliases: string[]
  createdAt: string
  updatedAt: string
}

export interface ProductPublicView {
  id: string
  storeId: string
  subcategoryId: string
  subcategoryName: string
  categoryId: string
  categoryName: string
  departmentId: string
  departmentName: string
  name: string
  description: string | null
  pricePaise: number
  // Phase 6.8 — price after an active discount (== pricePaise if none).
  effectivePricePaise: number
  discountType: DiscountType | null
  discountValue: number | null
  discountValidUntil: string | null
  unit: Unit
  imageUrl: string | null
  isAvailable: boolean
  isFeatured: boolean
  featuredOrder: number | null
}

/** Kept for back-compat (admin coupon tooling); same shape as before. */
export interface CategoryCount {
  id: string
  name: string
  productCount: number
}

/**
 * Phase 6.6 — new store-detail response. The customer renders:
 *   • departments    — Blinkit-style icon grid (each dept → its categories)
 *   • featuredProducts — owner-pinned, capped at 20
 *   • categorySections — first N admin Categories the store carries,
 *                        each with top M products + totalCount.
 *                        Sections beyond N come from
 *                        GET /v1/stores/:id/categories.
 */
export interface StoreDetailDepartmentView {
  id: string
  name: string
  displayOrder: number
  iconUrl: string | null
  categories: Array<{
    id: string
    name: string
    displayOrder: number
    iconUrl: string | null
  }>
}

export interface CategorySection {
  category: {
    id: string
    name: string
    displayOrder: number
    iconUrl: string | null
  }
  products: ProductPublicView[]
  totalCount: number
  hasMore: boolean
}

/** Active promotional banner shown atop the customer store page (Phase 6.8). */
export interface StoreActiveBanner {
  id: string
  name: string
  imageUrl: string
}

/** Owner-managed promotional banner (Phase 6.8). */
export interface StoreBanner {
  id: string
  name: string
  imageUrl: string
  imagePublicId: string | null
  isActive: boolean
  createdAt: string
}

export interface StoreDetailResult {
  store: StorePublicView
  departments: StoreDetailDepartmentView[]
  featuredProducts: ProductPublicView[]
  categorySections: CategorySection[]
  totalCategoryCount: number
  // Phase 6.8 — null when the store has no active banner.
  activeBanner: StoreActiveBanner | null
}

export interface StoreCategorySectionsResult {
  items: CategorySection[]
  page: number
  limit: number
  hasMore: boolean
  totalCategoryCount: number
}

export interface StoreProductsResult {
  items: ProductPublicView[]
  page: number
  limit: number
  hasMore: boolean
}

export interface OwnerProductsListResult {
  items: ProductOwnerView[]
  nextCursor: string | null
  hasMore: boolean
}

// --- Uploads (Phase 6.7: Cloudinary signed uploads) ---------------------

/** What an entity image can belong to. Owner scopes vs admin (icon) scopes. */
export type UploadScope = "product" | "store" | "banner" | "category" | "department"

/**
 * Signed payload the backend returns. The browser POSTs these fields (plus
 * the file) directly to Cloudinary — no bytes pass through our API.
 */
export interface UploadSignature {
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  folder: string
}

/** The bits of Cloudinary's upload response we persist on the entity. */
export interface UploadedImage {
  url: string
  publicId: string
}

// --- Search -------------------------------------------------------------

export interface SearchHit {
  id: string
  storeId: string
  storeName: string
  // Phase 6.6 — full taxonomy chain on every hit.
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
  score: number
}

export interface SearchResult {
  items: SearchHit[]
  page: number
  limit: number
  hasMore: boolean
}

// --- Addresses ----------------------------------------------------------

export interface Address {
  id: string
  label: string
  line1: string
  line2: string | null
  city: string
  pincode: string
  latitude: string
  longitude: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

// --- Coupons ------------------------------------------------------------

export type CouponType = "PERCENT" | "FLAT_PAISE"
export type CouponScope = "GLOBAL" | "STORE"

export interface Coupon {
  id: string
  code: string
  type: CouponType
  value: number
  scope: CouponScope
  storeId: string | null
  maxDiscountPaise: number | null
  minOrderPaise: number
  validFrom: string
  validUntil: string | null
  isActive: boolean
  totalUsageLimit: number | null
  perUserLimit: number
  usageCount: number
  createdById: string
  createdAt: string
  updatedAt: string
}

export interface CouponListResult {
  items: Coupon[]
  nextCursor: string | null
  hasMore: boolean
}

export type PreviewFailureReason =
  | "INVALID_CODE"
  | "MIN_ORDER_NOT_MET"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_UNAVAILABLE"
  | "MULTI_STORE_CART"

export interface PreviewBreakdown {
  subtotalPaise: number
  discountPaise: number
  finalPaise: number
  couponCode: string
  type: CouponType
  scope: CouponScope
  storeId: string | null
}

export type PreviewResult =
  | { isValid: true; discountPaise: number; breakdown: PreviewBreakdown }
  | { isValid: false; reason: PreviewFailureReason; minOrderPaise?: number }

// --- Admin --------------------------------------------------------------

export interface PendingOwner {
  id: string
  phone: string
  name: string
  createdAt: string
}

// --- Response envelope --------------------------------------------------

export interface SuccessEnvelope<T> {
  data: T
}

export interface ErrorEnvelopeBody {
  code: string
  message: string
  details?: unknown
}

export interface ErrorEnvelope {
  error: ErrorEnvelopeBody
}

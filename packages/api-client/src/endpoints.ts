import type { AxiosInstance } from "axios"
import type {
  Address,
  AuthSuccess,
  AuthUser,
  Category,
  Coupon,
  CouponListResult,
  CouponScope,
  CouponType,
  Department,
  DepartmentWithCategories,
  NearbyResult,
  OwnerProductsListResult,
  PendingOwner,
  PreviewResult,
  ProductOwnerView,
  SearchResult,
  SessionResult,
  StoreCategorySectionsResult,
  StoreDetailResult,
  StoreOwnerView,
  StoreProductsResult,
  SubcategoryOwnerView,
  SubcategoryPublicView,
  SuccessEnvelope,
  Unit,
} from "./types"

// ---------- Auth (Phase 6.5 — better-auth) ------------------------------

export interface SignupBody {
  email: string
  password: string
  name: string
  phone: string
  role: "CUSTOMER" | "OWNER"
}

export interface LoginBody {
  email: string
  password: string
}

/** Raised when sign-up succeeds but the OWNER awaits admin approval. */
export class PendingApprovalError extends Error {
  readonly user: AuthUser | null
  constructor(message: string, user: AuthUser | null = null) {
    super(message)
    this.name = "PendingApprovalError"
    this.user = user
  }
}

// ---------- Stores (owner) ----------------------------------------------

export interface CreateStoreBody {
  name: string
  description?: string
  phone: string
  latitude: number
  longitude: number
  deliveryRadiusMeters?: number
  minOrderPaise?: number
  addressLine: string
  city: string
  pincode: string
  imageUrl?: string
}

export type UpdateStoreBody = Partial<{
  name: string
  description: string | null
  phone: string
  latitude: number
  longitude: number
  deliveryRadiusMeters: number
  minOrderPaise: number
  addressLine: string
  city: string
  pincode: string
  imageUrl: string | null
}>

// ---------- Products (owner) --------------------------------------------

/** Phase 6.6 — products FK to Subcategory (L3), not Category. */
export interface CreateProductBody {
  subcategoryId: string
  name: string
  description?: string
  pricePaise: number
  unit: Unit
  imageUrl?: string
  isAvailable?: boolean
  searchAliases?: string[]
}

/**
 * PATCH no longer accepts subcategoryId — to move a product between subs,
 * use POST /v1/stores/me/products/:id/move with MoveProductBody.
 */
export type UpdateProductBody = Partial<{
  name: string
  description: string | null
  pricePaise: number
  unit: Unit
  imageUrl: string | null
  isAvailable: boolean
  searchAliases: string[]
}>

export interface MoveProductBody {
  subcategoryId: string
}

export interface OwnerProductsQuery {
  cursor?: string
  limit?: number
  // Phase 6.6 — both filters available; both compose.
  categoryId?: string
  subcategoryId?: string
  available?: boolean
  includeInactive?: boolean
  q?: string
}

// ---------- Subcategories (owner) ---------------------------------------

export interface CreateSubcategoryBody {
  categoryId: string
  name: string
  displayOrder?: number
}

export type UpdateSubcategoryBody = Partial<{
  name: string
  displayOrder: number
}>

export interface SetSubcategoryAvailabilityBody {
  isAvailable: boolean
}

export interface OwnerSubcategoriesQuery {
  categoryId?: string
}

// ---------- Departments (admin + public) --------------------------------

export interface CreateDepartmentBody {
  name: string
  displayOrder?: number
  iconUrl?: string
}

export type UpdateDepartmentBody = Partial<{
  name: string
  displayOrder: number
  iconUrl: string | null
}>

// ---------- Stores (public) ---------------------------------------------

export interface NearbyQuery {
  lat: number
  lng: number
  radiusMeters?: number
  page?: number
  limit?: number
  includeClosed?: boolean
}

export interface StoreProductsQuery {
  q?: string
  // Phase 6.6 — both filters; both compose.
  categoryId?: string
  subcategoryId?: string
  page?: number
  limit?: number
}

export interface StoreCategoriesQuery {
  page?: number
  limit?: number
}

// ---------- Search ------------------------------------------------------

export interface SearchProductsQuery {
  q: string
  page?: number
  limit?: number
  storeId?: string
  categoryId?: string
  subcategoryId?: string
  lat?: number
  lng?: number
  radiusMeters?: number
}

// ---------- Addresses ---------------------------------------------------

export interface CreateAddressBody {
  label: string
  line1: string
  line2?: string
  city: string
  pincode: string
  latitude: number
  longitude: number
  isDefault?: boolean
}

export type UpdateAddressBody = Partial<{
  label: string
  line1: string
  line2: string | null
  city: string
  pincode: string
  latitude: number
  longitude: number
}>

// ---------- Coupons -----------------------------------------------------

export interface CreateCouponBody {
  code: string
  type: CouponType
  value: number
  maxDiscountPaise?: number | null
  minOrderPaise?: number
  validFrom?: string
  validUntil?: string | null
  isActive?: boolean
  totalUsageLimit?: number | null
  perUserLimit?: number
}

export type UpdateCouponBody = Partial<Omit<CreateCouponBody, "code">> & {
  _?: CouponScope
}

export interface PreviewCouponBody {
  code: string
  cart: { productId: string; quantity: number }[]
}

// ---------- Admin -------------------------------------------------------

/** Phase 6.6 — category must live under a department. */
export interface CreateCategoryBody {
  departmentId: string
  name: string
  displayOrder?: number
  iconUrl?: string
}

/** Public list query supports narrowing to one department. */
export interface ListCategoriesQuery {
  departmentId?: string
}

export type UpdateCategoryBody = Partial<{
  name: string
  displayOrder: number
  iconUrl: string | null
}>

export interface PromoteProductBody {
  promotedUntil: string
}

// ========================================================================
// API surface
// ========================================================================

/** Plucks `.data.data` from a response. */
async function unwrap<T>(p: Promise<{ data: SuccessEnvelope<T> }>): Promise<T> {
  const r = await p
  return r.data.data
}

/** Plucks `.data.data[key]` from a response (for wrapped payloads like `{ owners: [...] }`). */
async function pluck<T, K extends string>(
  p: Promise<{ data: SuccessEnvelope<Record<K, T>> }>,
  key: K,
): Promise<T> {
  const r = await p
  return r.data.data[key]
}

export function buildApi(http: AxiosInstance) {
  return {
    auth: {
      /**
       * Sign up a CUSTOMER or OWNER. Better-auth's auto-sign-in attempts
       * to set the session cookie immediately. For CUSTOMER this succeeds
       * (200). For OWNER it fails with FORBIDDEN because the session-create
       * hook blocks pending-approval owners — but the user IS created in
       * the DB. We translate that case to a PendingApprovalError so the
       * caller can route to the "awaiting admin" screen.
       */
      signup: async (body: SignupBody): Promise<AuthSuccess> => {
        try {
          // rememberMe: true keeps the session cookie persistent across
          // browser restarts. Without it, better-auth sets the
          // `kirana.dont_remember` cookie and the session becomes
          // browser-lifetime only.
          const res = await http.post<AuthSuccess>("/v1/auth/sign-up/email", {
            ...body,
            rememberMe: true,
          })
          return res.data
        } catch (err) {
          if (err instanceof Error && err.name === "ApiError") {
            const e = err as unknown as { status: number; message: string }
            if (e.status === 403 && /pending admin approval/i.test(e.message)) {
              throw new PendingApprovalError(e.message)
            }
          }
          throw err
        }
      },
      login: async (body: LoginBody): Promise<AuthSuccess> => {
        // rememberMe — same reasoning as signup above. Persistent session,
        // no `dont_remember` cookie.
        const res = await http.post<AuthSuccess>("/v1/auth/sign-in/email", {
          ...body,
          rememberMe: true,
        })
        return res.data
      },
      logout: () => http.post("/v1/auth/sign-out").then(() => undefined),
      /**
       * Returns null when the caller has no valid session — matches
       * better-auth's contract (200 + null body, not 401).
       */
      getSession: async (): Promise<SessionResult | null> => {
        const res = await http.get<SessionResult | null | "">("/v1/auth/get-session")
        if (res.data === null || res.data === "" || res.data === undefined) return null
        return res.data
      },
      /** Convenience for callers that just want the user. */
      me: async (): Promise<{ user: AuthUser } | null> => {
        const session = await (async () => {
          const res = await http.get<SessionResult | null | "">("/v1/auth/get-session")
          if (res.data === null || res.data === "" || res.data === undefined) return null
          return res.data
        })()
        return session === null ? null : { user: session.user }
      },
    },

    departments: {
      // GET /v1/departments → { departments: Department[] }
      // GET /v1/departments?nested=true → { departments: DepartmentWithCategories[] }
      list: (opts: { nested?: boolean } = {}) =>
        pluck<Department[], "departments">(
          http.get("/v1/departments", {
            params: opts.nested ? { nested: "true" } : {},
          }),
          "departments",
        ),
      listNested: () =>
        pluck<DepartmentWithCategories[], "departments">(
          http.get("/v1/departments", { params: { nested: "true" } }),
          "departments",
        ),
      adminCreate: (body: CreateDepartmentBody) =>
        pluck<Department, "department">(
          http.post("/v1/admin/departments", body),
          "department",
        ),
      adminUpdate: (id: string, body: UpdateDepartmentBody) =>
        pluck<Department, "department">(
          http.patch(`/v1/admin/departments/${id}`, body),
          "department",
        ),
    },

    categories: {
      // GET /v1/categories → { categories: Category[] }
      list: (q: ListCategoriesQuery = {}) =>
        pluck<Category[], "categories">(
          http.get("/v1/categories", { params: serializeQuery(q) }),
          "categories",
        ),
    },

    subcategories: {
      // Owner-side CRUD under /v1/stores/me/subcategories.
      ownerList: (q: OwnerSubcategoriesQuery = {}) =>
        pluck<SubcategoryOwnerView[], "subcategories">(
          http.get("/v1/stores/me/subcategories", {
            params: serializeQuery(q),
          }),
          "subcategories",
        ),
      ownerCreate: (body: CreateSubcategoryBody) =>
        pluck<SubcategoryOwnerView, "subcategory">(
          http.post("/v1/stores/me/subcategories", body),
          "subcategory",
        ),
      ownerUpdate: (id: string, body: UpdateSubcategoryBody) =>
        pluck<SubcategoryOwnerView, "subcategory">(
          http.patch(`/v1/stores/me/subcategories/${id}`, body),
          "subcategory",
        ),
      ownerRemove: (id: string) =>
        http.delete(`/v1/stores/me/subcategories/${id}`).then(() => undefined),
      ownerSetAvailability: (id: string, isAvailable: boolean) =>
        pluck<SubcategoryOwnerView, "subcategory">(
          http.patch(`/v1/stores/me/subcategories/${id}/availability`, {
            isAvailable,
          } satisfies SetSubcategoryAvailabilityBody),
          "subcategory",
        ),
      // Public — for the customer category-page left rail.
      publicForStoreCategory: (storeId: string, categoryId: string) =>
        pluck<SubcategoryPublicView[], "subcategories">(
          http.get(`/v1/stores/${storeId}/categories/${categoryId}/subcategories`),
          "subcategories",
        ),
    },

    stores: {
      // public discovery — flat result objects
      nearby: (q: NearbyQuery) =>
        unwrap<NearbyResult>(
          http.get("/v1/stores/nearby", { params: serializeQuery(q) }),
        ),
      detail: (id: string) =>
        unwrap<StoreDetailResult>(http.get(`/v1/stores/${id}`)),
      products: (id: string, q: StoreProductsQuery = {}) =>
        unwrap<StoreProductsResult>(
          http.get(`/v1/stores/${id}/products`, { params: serializeQuery(q) }),
        ),
      // Phase 6.6 — paginated continuation of categorySections.
      categories: (id: string, q: StoreCategoriesQuery = {}) =>
        unwrap<StoreCategorySectionsResult>(
          http.get(`/v1/stores/${id}/categories`, {
            params: serializeQuery(q),
          }),
        ),

      // owner — wrapped under "store"
      createMine: (body: CreateStoreBody) =>
        pluck<StoreOwnerView, "store">(
          http.post("/v1/stores/me", body),
          "store",
        ),
      getMine: () =>
        pluck<StoreOwnerView, "store">(http.get("/v1/stores/me"), "store"),
      updateMine: (body: UpdateStoreBody) =>
        pluck<StoreOwnerView, "store">(
          http.patch("/v1/stores/me", body),
          "store",
        ),
      toggleOpen: (isOpen: boolean) =>
        pluck<StoreOwnerView, "store">(
          http.patch("/v1/stores/me/open", { isOpen }),
          "store",
        ),
    },

    products: {
      // owner products: list returns flat; mutations return { product }
      list: (q: OwnerProductsQuery = {}) =>
        unwrap<OwnerProductsListResult>(
          http.get("/v1/stores/me/products", { params: serializeQuery(q) }),
        ),
      get: (id: string) =>
        pluck<ProductOwnerView, "product">(
          http.get(`/v1/stores/me/products/${id}`),
          "product",
        ),
      create: (body: CreateProductBody) =>
        pluck<ProductOwnerView, "product">(
          http.post("/v1/stores/me/products", body),
          "product",
        ),
      update: (id: string, body: UpdateProductBody) =>
        pluck<ProductOwnerView, "product">(
          http.patch(`/v1/stores/me/products/${id}`, body),
          "product",
        ),
      remove: (id: string) =>
        pluck<ProductOwnerView, "product">(
          http.delete(`/v1/stores/me/products/${id}`),
          "product",
        ),
      restore: (id: string) =>
        pluck<ProductOwnerView, "product">(
          http.post(`/v1/stores/me/products/${id}/restore`),
          "product",
        ),
      feature: (id: string, featuredOrder?: number) =>
        pluck<ProductOwnerView, "product">(
          http.post(`/v1/stores/me/products/${id}/feature`, { featuredOrder }),
          "product",
        ),
      unfeature: (id: string) =>
        pluck<ProductOwnerView, "product">(
          http.delete(`/v1/stores/me/products/${id}/feature`),
          "product",
        ),
      // Phase 6.6 — relocate a product between subs in the same store.
      move: (id: string, body: MoveProductBody) =>
        pluck<ProductOwnerView, "product">(
          http.post(`/v1/stores/me/products/${id}/move`, body),
          "product",
        ),
    },

    search: {
      products: (q: SearchProductsQuery) =>
        unwrap<SearchResult>(
          http.get("/v1/search/products", { params: serializeQuery(q) }),
        ),
    },

    addresses: {
      // GET /v1/addresses → { items: Address[] }
      list: () =>
        pluck<Address[], "items">(http.get("/v1/addresses"), "items"),
      get: (id: string) =>
        pluck<Address, "address">(http.get(`/v1/addresses/${id}`), "address"),
      create: (body: CreateAddressBody) =>
        pluck<Address, "address">(http.post("/v1/addresses", body), "address"),
      update: (id: string, body: UpdateAddressBody) =>
        pluck<Address, "address">(
          http.patch(`/v1/addresses/${id}`, body),
          "address",
        ),
      remove: (id: string) =>
        http.delete(`/v1/addresses/${id}`).then(() => undefined),
      setDefault: (id: string) =>
        pluck<Address, "address">(
          http.post(`/v1/addresses/${id}/default`),
          "address",
        ),
    },

    coupons: {
      // preview returns the flat PreviewResult.
      preview: (body: PreviewCouponBody) =>
        unwrap<PreviewResult>(http.post("/v1/coupons/preview", body)),

      // owner-scoped CRUD — list flat, mutations wrap under "coupon"
      ownerList: () =>
        unwrap<CouponListResult>(http.get("/v1/stores/me/coupons")),
      ownerCreate: (body: CreateCouponBody) =>
        pluck<Coupon, "coupon">(
          http.post("/v1/stores/me/coupons", body),
          "coupon",
        ),
      ownerUpdate: (id: string, body: UpdateCouponBody) =>
        pluck<Coupon, "coupon">(
          http.patch(`/v1/stores/me/coupons/${id}`, body),
          "coupon",
        ),
      ownerRemove: (id: string) =>
        http.delete(`/v1/stores/me/coupons/${id}`).then(() => undefined),

      // admin-scoped CRUD — same pattern
      adminList: () =>
        unwrap<CouponListResult>(http.get("/v1/admin/coupons")),
      adminCreate: (body: CreateCouponBody) =>
        pluck<Coupon, "coupon">(
          http.post("/v1/admin/coupons", body),
          "coupon",
        ),
      adminUpdate: (id: string, body: UpdateCouponBody) =>
        pluck<Coupon, "coupon">(
          http.patch(`/v1/admin/coupons/${id}`, body),
          "coupon",
        ),
      adminRemove: (id: string) =>
        http.delete(`/v1/admin/coupons/${id}`).then(() => undefined),
    },

    admin: {
      // /users/pending-owners → { owners: PendingOwner[] }
      pendingOwners: () =>
        pluck<PendingOwner[], "owners">(
          http.get("/v1/admin/users/pending-owners"),
          "owners",
        ),
      approveOwner: (id: string) =>
        http.post(`/v1/admin/users/${id}/approve`).then(() => undefined),
      rejectOwner: (id: string) =>
        http.post(`/v1/admin/users/${id}/reject`).then(() => undefined),

      createCategory: (body: CreateCategoryBody) =>
        pluck<Category, "category">(
          http.post("/v1/admin/categories", body),
          "category",
        ),
      updateCategory: (id: string, body: UpdateCategoryBody) =>
        pluck<Category, "category">(
          http.patch(`/v1/admin/categories/${id}`, body),
          "category",
        ),

      promoteProduct: (id: string, body: PromoteProductBody) =>
        pluck<ProductOwnerView, "product">(
          http.post(`/v1/admin/products/${id}/promote`, body),
          "product",
        ),
      unpromoteProduct: (id: string) =>
        http.delete(`/v1/admin/products/${id}/promote`).then(() => undefined),
    },
  }
}

export type Api = ReturnType<typeof buildApi>

/** Strip undefined/null, coerce booleans to "true"/"false" for the backend zod coerce pipeline. */
function serializeQuery(q: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue
    out[k] = typeof v === "boolean" ? String(v) : v
  }
  return out
}

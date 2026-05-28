// Re-export shared API types from a single api-client entrypoint so apps
// don't pull from both @workspace/shared and @workspace/api-client.

export type {
  Address,
  AuthSuccess,
  AuthUser,
  Category,
  CategoryCount,
  CategorySection,
  Coupon,
  CouponListResult,
  CouponScope,
  CouponType,
  Department,
  DepartmentWithCategories,
  ErrorEnvelope,
  ErrorEnvelopeBody,
  NearbyResult,
  OwnerProductsListResult,
  PendingOwner,
  PreviewBreakdown,
  PreviewFailureReason,
  PreviewResult,
  ProductOwnerView,
  ProductPublicView,
  SearchHit,
  SearchResult,
  SessionResult,
  StoreCategorySectionsResult,
  StoreDetailDepartmentView,
  StoreDetailResult,
  StoreNearbyHit,
  StoreOwnerView,
  StorePublicView,
  StoreProductsResult,
  StoreActiveBanner,
  StoreBanner,
  SubcategoryOwnerView,
  SubcategoryPublicView,
  SuccessEnvelope,
  Unit,
  UploadedImage,
  UploadScope,
  UploadSignature,
} from "@workspace/shared"

export { UNIT_LABELS } from "@workspace/shared"

/** Error raised by the API client when the server responds with a non-2xx. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown
  constructor(opts: { code: string; message: string; status: number; details?: unknown }) {
    super(opts.message)
    this.name = "ApiError"
    this.code = opts.code
    this.status = opts.status
    this.details = opts.details
  }
}

import { Router } from "express"
import { Role } from "../../generated/prisma/enums.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { validate } from "../../middleware/validate.js"
import { couponsOwnerRouter } from "../coupons/coupons.routes.js"
import { productsRouter } from "../products/products.routes.js"
import * as subcontroller from "../subcategories/subcategories.controller.js"
import { publicListSubcategoriesParamSchema } from "../subcategories/subcategories.schemas.js"
import { subcategoriesOwnerRouter } from "../subcategories/subcategories.routes.js"
import * as controller from "./stores.controller.js"
import {
  createStoreBodySchema,
  nearbyQuerySchema,
  openToggleBodySchema,
  storeCategoriesQuerySchema,
  storeIdParamSchema,
  storeProductsQuerySchema,
  updateStoreBodySchema,
} from "./stores.schemas.js"

// --- Phase 5: public discovery -----------------------------------------

/**
 * Public, anonymous-allowed discovery routes. Mounted at /v1/stores BEFORE
 * the owner-side router (below) so explicit GETs handle their paths first.
 *
 * /me fall-through: the owner storesRouter sits behind this one on the SAME
 * prefix. Without the guard below, the `/:id` wildcard would shadow `/me`
 * and Express would dispatch /v1/stores/me/* to this router — where strict
 * validation on `storeProductsQuerySchema` would reject owner-only query
 * params like `includeInactive`. `next("router")` exits this router
 * entirely so /me/* falls through to the owner mount.
 */
export const storesPublicRouter: Router = Router()

storesPublicRouter.use((req, _res, next) => {
  // Lower-case the comparison so /Me, /ME etc. still fall through (Express
  // routing is case-sensitive by default; we don't want to give a friendly
  // 404 from public code paths for a typo'd /me request).
  const path = req.path.toLowerCase()
  if (path === "/me" || path.startsWith("/me/")) {
    return next("router")
  }
  next()
})

storesPublicRouter.get(
  "/nearby",
  validate({ query: nearbyQuerySchema }),
  controller.listNearby,
)
// Phase 6.6 — public category-page left rail. Mounted BEFORE /:id so
// the `/:id/categories/...` paths don't get shadowed by the /:id wildcard.
storesPublicRouter.get(
  "/:id/categories/:categoryId/subcategories",
  validate({ params: publicListSubcategoriesParamSchema }),
  subcontroller.publicListForStoreCategory,
)
// Lazy-paginated continuation of categorySections in the store-detail
// response. The FE calls this when scrolling past the initial 8 sections.
storesPublicRouter.get(
  "/:id/categories",
  validate({ params: storeIdParamSchema, query: storeCategoriesQuerySchema }),
  controller.listPublicCategorySections,
)
storesPublicRouter.get(
  "/:id/products",
  validate({ params: storeIdParamSchema, query: storeProductsQuerySchema }),
  controller.listPublicProducts,
)
storesPublicRouter.get(
  "/:id",
  validate({ params: storeIdParamSchema }),
  controller.getPublic,
)

// --- Owner self-service ------------------------------------------------

/**
 * Owner-side store routes. All endpoints under /v1/stores/me require an
 * approved OWNER. requireAuth handles approval (rejects with 403 if not
 * approved). Phase 5 added storesPublicRouter above; both are mounted on
 * /v1/stores in app.ts (public first, owner second).
 */
export const storesRouter: Router = Router()

storesRouter.use(requireAuth, requireRole(Role.OWNER))

storesRouter.post(
  "/me",
  validate({ body: createStoreBodySchema }),
  controller.createOwnStore,
)
storesRouter.get("/me", controller.getOwnStore)
storesRouter.patch(
  "/me",
  validate({ body: updateStoreBodySchema }),
  controller.updateOwnStore,
)
storesRouter.patch(
  "/me/open",
  validate({ body: openToggleBodySchema }),
  controller.toggleOpen,
)

// Products live under the same /me/ scope so they share auth + the
// requireOwnStore middleware. productsRouter applies requireOwnStore
// internally.
storesRouter.use("/me/products", productsRouter)

// Phase 6.6 — owner-side subcategory CRUD (L3, store-owned). Same /me/
// scoping pattern; the inner router applies requireOwnStore itself.
storesRouter.use("/me/subcategories", subcategoriesOwnerRouter)

// Store-scoped coupons (owner-created, STORE scope only). The owner router
// self-gates with requireAuth + requireRole(OWNER) + requireOwnStore.
storesRouter.use("/me/coupons", couponsOwnerRouter)

import { signUpload, type UploadSignature } from "../../lib/cloudinary.js"

/**
 * Owner upload signature. The folder is derived from the caller's user id
 * (server-side), never from the request body — so owner A can never obtain a
 * signature targeting owner B's folder. Using the user id (not the store id)
 * lets the store image be uploaded during onboarding, before the store exists.
 */
export function signOwnerUpload(
  ownerId: string,
  scope: "product" | "store" | "banner",
): UploadSignature {
  const prefix =
    scope === "product" ? "products" : scope === "banner" ? "banners" : "stores"
  return signUpload(`${prefix}/${ownerId}`)
}

/** Admin upload signature for global category / department icons. */
export function signAdminUpload(scope: "category" | "department"): UploadSignature {
  const folder = scope === "department" ? "departments" : "categories"
  return signUpload(folder)
}

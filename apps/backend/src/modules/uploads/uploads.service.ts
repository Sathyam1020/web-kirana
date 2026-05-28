import { signUpload, type UploadSignature } from "../../lib/cloudinary.js"

/**
 * Owner upload signature. The folder is derived from the caller's own store
 * id (server-side), never from the request body — so owner A can never obtain
 * a signature targeting owner B's folder.
 */
export function signOwnerUpload(
  storeId: string,
  scope: "product" | "store",
): UploadSignature {
  const folder = scope === "product" ? `products/${storeId}` : `stores/${storeId}`
  return signUpload(folder)
}

/** Admin upload signature for global category / department icons. */
export function signAdminUpload(scope: "category" | "department"): UploadSignature {
  const folder = scope === "department" ? "departments" : "categories"
  return signUpload(folder)
}

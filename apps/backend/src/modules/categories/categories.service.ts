import { prisma } from "../../db/prisma.js"
import { events } from "../../lib/events.js"
import { NotFoundError } from "../../lib/errors.js"
import { rethrowAsAppError } from "../../lib/prisma-errors.js"
import type { CreateCategoryBody, UpdateCategoryBody } from "./categories.schemas.js"

export interface CategoryView {
  id: string
  name: string
  displayOrder: number
  iconUrl: string | null
  createdAt: Date
}

const SELECT = {
  id: true,
  name: true,
  displayOrder: true,
  iconUrl: true,
  createdAt: true,
} as const

export async function listCategories(): Promise<CategoryView[]> {
  return prisma.category.findMany({
    select: SELECT,
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  })
}

export async function createCategory(
  input: CreateCategoryBody,
  actorId: string,
): Promise<CategoryView> {
  try {
    const created = await prisma.category.create({
      data: {
        name: input.name,
        displayOrder: input.displayOrder,
        iconUrl: input.iconUrl,
      },
      select: SELECT,
    })
    events.emit({ type: "category.created", categoryId: created.id, actorId })
    return created
  } catch (err) {
    rethrowAsAppError(err)
  }
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryBody,
  actorId: string,
): Promise<CategoryView> {
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder
  if (input.iconUrl !== undefined) data.iconUrl = input.iconUrl // null OK to clear

  if (Object.keys(data).length === 0) {
    // No-op PATCH — return current state.
    const existing = await prisma.category.findUnique({ where: { id }, select: SELECT })
    if (existing === null) throw new NotFoundError("Category not found")
    return existing
  }

  try {
    const updated = await prisma.category.update({
      where: { id },
      data,
      select: SELECT,
    })
    events.emit({
      type: "category.updated",
      categoryId: id,
      actorId,
      fields: Object.keys(data),
    })
    return updated
  } catch (err) {
    rethrowAsAppError(err)
  }
}

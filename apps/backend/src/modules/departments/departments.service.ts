import { prisma } from "../../db/prisma.js"
import { events } from "../../lib/events.js"
import { NotFoundError } from "../../lib/errors.js"
import { rethrowAsAppError } from "../../lib/prisma-errors.js"
import type {
  CreateDepartmentBody,
  UpdateDepartmentBody,
} from "./departments.schemas.js"

export interface DepartmentView {
  id: string
  name: string
  displayOrder: number
  iconUrl: string | null
  createdAt: Date
}

export interface DepartmentWithCategoriesView extends DepartmentView {
  categories: Array<{
    id: string
    name: string
    displayOrder: number
    iconUrl: string | null
  }>
}

const SELECT = {
  id: true,
  name: true,
  displayOrder: true,
  iconUrl: true,
  createdAt: true,
} as const

export async function listDepartments(opts: {
  nested: boolean
}): Promise<DepartmentView[] | DepartmentWithCategoriesView[]> {
  if (!opts.nested) {
    return prisma.department.findMany({
      select: SELECT,
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    })
  }
  const rows = await prisma.department.findMany({
    select: {
      ...SELECT,
      categories: {
        select: {
          id: true,
          name: true,
          displayOrder: true,
          iconUrl: true,
        },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      },
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  })
  return rows
}

export async function createDepartment(
  input: CreateDepartmentBody,
  actorId: string,
): Promise<DepartmentView> {
  try {
    const created = await prisma.department.create({
      data: {
        name: input.name,
        displayOrder: input.displayOrder,
        iconUrl: input.iconUrl,
      },
      select: SELECT,
    })
    events.emit({
      type: "department.created",
      departmentId: created.id,
      actorId,
    })
    return created
  } catch (err) {
    rethrowAsAppError(err)
  }
}

export async function updateDepartment(
  id: string,
  input: UpdateDepartmentBody,
  actorId: string,
): Promise<DepartmentView> {
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder
  if (input.iconUrl !== undefined) data.iconUrl = input.iconUrl

  if (Object.keys(data).length === 0) {
    const existing = await prisma.department.findUnique({
      where: { id },
      select: SELECT,
    })
    if (existing === null) throw new NotFoundError("Department not found")
    return existing
  }

  try {
    const updated = await prisma.department.update({
      where: { id },
      data,
      select: SELECT,
    })
    events.emit({
      type: "department.updated",
      departmentId: id,
      actorId,
      fields: Object.keys(data),
    })
    return updated
  } catch (err) {
    rethrowAsAppError(err)
  }
}

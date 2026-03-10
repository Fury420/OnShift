"use server"

import { db } from "@/db"
import { positions } from "@/db/schema"
import { requireAdmin, getOrganizationId } from "@/lib/auth-guard"
import { eq, and, asc } from "drizzle-orm"
import { revalidatePath } from "next/cache"

export async function getPositions() {
  await requireAdmin()
  const orgId = await getOrganizationId()

  return db
    .select()
    .from(positions)
    .where(eq(positions.organizationId, orgId))
    .orderBy(asc(positions.sortOrder), asc(positions.name))
}

export async function createPosition(name: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  const [pos] = await db
    .insert(positions)
    .values({ organizationId: orgId, name })
    .returning()

  revalidatePath("/admin/employees")
  revalidatePath("/admin/positions")
  return pos
}

export async function updatePosition(id: string, data: { name?: string }) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db
    .update(positions)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(positions.id, id), eq(positions.organizationId, orgId)))

  revalidatePath("/admin/employees")
  revalidatePath("/admin/positions")
}

export async function deletePosition(id: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db.delete(positions).where(and(eq(positions.id, id), eq(positions.organizationId, orgId)))

  revalidatePath("/admin/employees")
  revalidatePath("/admin/positions")
}

export async function reorderPositions(orderedIds: string[]) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await Promise.all(
    orderedIds.map((id, i) =>
      db
        .update(positions)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(positions.id, id), eq(positions.organizationId, orgId))),
    ),
  )

  revalidatePath("/admin/employees")
  revalidatePath("/admin/positions")
}

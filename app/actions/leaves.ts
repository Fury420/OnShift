"use server"

import { db } from "@/db"
import { leaves } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/session"
import { requireAdmin, getOrganizationId } from "@/lib/auth-guard"

export async function requestLeave(data: {
  type: "vacation" | "sick" | "personal"
  startDate: string
  endDate: string
  note?: string
}) {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený.")
  const orgId = await getOrganizationId()

  await db.insert(leaves).values({
    organizationId: orgId,
    userId: session.user.id,
    type: data.type,
    startDate: data.startDate,
    endDate: data.endDate,
    note: data.note || null,
    status: "pending",
  })

  revalidatePath("/leaves")
  revalidatePath("/admin/leaves")
  revalidatePath("/replacements")
}

export async function cancelLeave(id: string) {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený.")

  const [leave] = await db
    .select({ userId: leaves.userId, status: leaves.status })
    .from(leaves)
    .where(eq(leaves.id, id))
    .limit(1)

  if (!leave) throw new Error("Žiadosť nebola nájdená.")
  if (leave.userId !== session.user.id) throw new Error("Nemáte oprávnenie.")
  if (leave.status !== "pending") throw new Error("Schválenú alebo zamietnutú žiadosť nie je možné zrušiť.")

  await db.delete(leaves).where(and(eq(leaves.id, id), eq(leaves.userId, session.user.id)))

  revalidatePath("/leaves")
  revalidatePath("/admin/leaves")
  revalidatePath("/replacements")
}

export async function updateLeave(
  id: string,
  data: { type: "vacation" | "sick" | "personal"; startDate: string; endDate: string; note?: string },
) {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený.")

  const [leave] = await db
    .select({ userId: leaves.userId, status: leaves.status })
    .from(leaves)
    .where(eq(leaves.id, id))
    .limit(1)

  if (!leave || leave.userId !== session.user.id) throw new Error("Nemáte oprávnenie.")
  if (leave.status !== "pending") throw new Error("Nie je možné upraviť schválenú alebo zamietnutú žiadosť.")

  await db
    .update(leaves)
    .set({ type: data.type, startDate: data.startDate, endDate: data.endDate, note: data.note || null, updatedAt: new Date() })
    .where(and(eq(leaves.id, id), eq(leaves.userId, session.user.id)))

  revalidatePath("/leaves")
  revalidatePath("/admin/leaves")
  revalidatePath("/replacements")
}

export async function adminUpdateLeave(
  id: string,
  data: { type: "vacation" | "sick" | "personal"; startDate: string; endDate: string; note?: string },
) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db
    .update(leaves)
    .set({ type: data.type, startDate: data.startDate, endDate: data.endDate, note: data.note || null, updatedAt: new Date() })
    .where(and(eq(leaves.id, id), eq(leaves.organizationId, orgId)))

  revalidatePath("/leaves")
  revalidatePath("/admin/leaves")
}

export async function adminUpdateLeaveStatus(id: string, status: "approved" | "rejected") {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db
    .update(leaves)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(leaves.id, id), eq(leaves.organizationId, orgId)))

  revalidatePath("/leaves")
  revalidatePath("/admin/leaves")
  revalidatePath("/schedule")
  revalidatePath("/replacements")
}

export async function adminDeleteLeave(id: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db.delete(leaves).where(and(eq(leaves.id, id), eq(leaves.organizationId, orgId)))

  revalidatePath("/leaves")
  revalidatePath("/admin/leaves")
}

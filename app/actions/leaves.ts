"use server"

import { db } from "@/db"
import { leaves } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/session"
import { requireAdmin, getOrganizationId } from "@/lib/auth-guard"
import { createNotification, getAdminIds } from "@/lib/notifications"

export async function requestLeave(data: {
  type: "vacation" | "sick" | "personal"
  startDate: string
  endDate: string
  note?: string
  suggestedReplacementUserId?: string
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
    suggestedReplacementUserId: data.suggestedReplacementUserId || null,
  })

  getAdminIds(orgId).then((adminIds) =>
    createNotification({
      organizationId: orgId,
      actorId: session.user.id,
      recipientIds: adminIds,
      type: "leave_requested",
      title: `${session.user.name} požiadal/a o voľno (${data.startDate} – ${data.endDate})`,
      linkUrl: "/admin/leaves",
    }),
  ).catch(console.error)

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

  const orgId = await getOrganizationId()

  await db.delete(leaves).where(and(eq(leaves.id, id), eq(leaves.userId, session.user.id)))

  getAdminIds(orgId).then((adminIds) =>
    createNotification({
      organizationId: orgId,
      actorId: session.user.id,
      recipientIds: adminIds,
      type: "leave_cancelled",
      title: `${session.user.name} zrušil/a žiadosť o voľno`,
      linkUrl: "/admin/leaves",
    }),
  ).catch(console.error)

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
  const session = await requireAdmin()
  const orgId = await getOrganizationId()

  const [leave] = await db
    .select({ userId: leaves.userId, startDate: leaves.startDate })
    .from(leaves)
    .where(and(eq(leaves.id, id), eq(leaves.organizationId, orgId)))
    .limit(1)

  await db
    .update(leaves)
    .set({ status, approvedBy: session.user.id, updatedAt: new Date() })
    .where(and(eq(leaves.id, id), eq(leaves.organizationId, orgId)))

  if (leave) {
    const linkUrl = leave.startDate ? `/schedule?month=${leave.startDate.slice(0, 7)}&date=${leave.startDate}` : "/leaves"
    createNotification({
      organizationId: orgId,
      actorId: session.user.id,
      recipientIds: [leave.userId],
      type: status === "approved" ? "leave_approved" : "leave_rejected",
      title: `Vaša žiadosť o voľno bola ${status === "approved" ? "schválená" : "zamietnutá"}`,
      linkUrl,
      referenceId: id,
    }).catch(console.error)
  }

  revalidatePath("/leaves")
  revalidatePath("/admin/leaves")
  revalidatePath("/schedule")
  revalidatePath("/replacements")
}

/** Schválenie/zamietnutie žiadosti o voľno – môže admin alebo navrhnutý zastup. */
export async function approveLeave(id: string, status: "approved" | "rejected") {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený.")
  const orgId = await getOrganizationId()
  const currentUserId = session.user.id
  const isAdmin = (session.user as { role?: string }).role === "admin"

  const [leave] = await db
    .select({ id: leaves.id, userId: leaves.userId, organizationId: leaves.organizationId, status: leaves.status, suggestedReplacementUserId: leaves.suggestedReplacementUserId, startDate: leaves.startDate })
    .from(leaves)
    .where(eq(leaves.id, id))
    .limit(1)

  if (!leave) throw new Error("Žiadosť nebola nájdená.")
  if (leave.organizationId !== orgId) throw new Error("Nemáte oprávnenie.")
  if (leave.status !== "pending") throw new Error("Žiadosť už bola vybavená.")

  const mayApprove = isAdmin || leave.suggestedReplacementUserId === currentUserId
  if (!mayApprove) throw new Error("Nemáte oprávnenie schváliť túto žiadosť.")

  await db
    .update(leaves)
    .set({ status, approvedBy: currentUserId, updatedAt: new Date() })
    .where(eq(leaves.id, id))

  const linkUrl = leave.startDate ? `/schedule?month=${leave.startDate.slice(0, 7)}&date=${leave.startDate}` : "/leaves"
  createNotification({
    organizationId: orgId,
    actorId: currentUserId,
    recipientIds: [leave.userId],
    type: status === "approved" ? "leave_approved" : "leave_rejected",
    title: `Vaša žiadosť o voľno bola ${status === "approved" ? "schválená" : "zamietnutá"}`,
    linkUrl,
    referenceId: id,
  }).catch(console.error)

  revalidatePath("/leaves")
  revalidatePath("/admin/leaves")
  revalidatePath("/replacements")
}

export async function adminDeleteLeave(id: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db.delete(leaves).where(and(eq(leaves.id, id), eq(leaves.organizationId, orgId)))

  revalidatePath("/leaves")
  revalidatePath("/admin/leaves")
  revalidatePath("/replacements")
}

"use server"

import { db } from "@/db"
import { shifts, shiftReplacements, openShiftClaims } from "@/db/schema"
import { getSession } from "@/lib/session"
import { requireManagerOrAdmin, getOrganizationId } from "@/lib/auth-guard"
import { eq, and } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { createNotification, getAdminIds } from "@/lib/notifications"

export async function requestReplacement(shiftId: string, replacementUserId: string, note?: string) {
  const session = await getSession()
  if (!session) throw new Error("Neprihlásený")
  const orgId = await getOrganizationId()

  const [shift] = await db
    .select({ userId: shifts.userId, date: shifts.date, organizationId: shifts.organizationId })
    .from(shifts)
    .where(and(eq(shifts.id, shiftId), eq(shifts.organizationId, orgId)))
    .limit(1)

  if (!shift) throw new Error("Zmena neexistuje")
  const role = (session.user as { role?: string }).role
  const isAdminOrManager = role === "admin" || role === "manager"
  const isAssignedToMe = shift.userId === session.user.id
  const [myClaim] =
    !isAdminOrManager && !isAssignedToMe
      ? await db
          .select({ id: openShiftClaims.id })
          .from(openShiftClaims)
          .where(and(eq(openShiftClaims.shiftId, shiftId), eq(openShiftClaims.claimedByUserId, session.user.id), eq(openShiftClaims.status, "approved")))
          .limit(1)
      : [{ id: null as string | null }]
  if (!isAdminOrManager && !isAssignedToMe && !myClaim?.id) throw new Error("Nemáš oprávnenie")

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const shiftDate = new Date(shift.date + "T00:00:00")
  if (shiftDate < today) throw new Error("Nemôžeš požiadať o zastup na minulú zmenu")

  const [existing] = await db
    .select({ id: shiftReplacements.id })
    .from(shiftReplacements)
    .where(and(eq(shiftReplacements.shiftId, shiftId), eq(shiftReplacements.status, "pending")))
    .limit(1)

  if (existing) throw new Error("Pre túto zmenu už existuje čakajúca žiadosť")

  await db.insert(shiftReplacements).values({
    organizationId: orgId,
    shiftId,
    requestedByUserId: session.user.id,
    replacementUserId,
    note: note ?? null,
  })

  const linkUrl = `/replacements?month=${shift.date.slice(0, 7)}`
  getAdminIds(orgId).then((adminIds) =>
    createNotification({
      organizationId: orgId,
      actorId: session.user.id,
      recipientIds: [replacementUserId, ...adminIds],
      type: "replacement_requested",
      title: `${session.user.name} žiada o zastúpenie zmeny`,
      linkUrl,
    }),
  ).catch(console.error)

  revalidatePath("/replacements")
  return { shiftDate: shift.date }
}

export async function respondToReplacement(id: string, response: "accepted" | "rejected") {
  const session = await getSession()
  if (!session) throw new Error("Neprihlásený")
  const orgId = await getOrganizationId()

  let requestedByUserId: string | null = null
  let shiftDateForLink: string | null = null

  await db.transaction(async (tx) => {
    const [replacement] = await tx
      .select()
      .from(shiftReplacements)
      .where(and(eq(shiftReplacements.id, id), eq(shiftReplacements.status, "pending")))
      .limit(1)

    if (!replacement) throw new Error("Žiadosť už bola vybavená")
    if (replacement.replacementUserId !== session.user.id) throw new Error("Nemáš oprávnenie")

    requestedByUserId = replacement.requestedByUserId

    const [shiftRow] = await tx
      .select({ date: shifts.date })
      .from(shifts)
      .where(eq(shifts.id, replacement.shiftId))
      .limit(1)
    shiftDateForLink = shiftRow?.date ?? null

    if (response === "accepted") {
      await tx
        .update(shifts)
        .set({ userId: replacement.replacementUserId, updatedAt: new Date() })
        .where(eq(shifts.id, replacement.shiftId))
    }

    await tx
      .update(shiftReplacements)
      .set({ status: response, updatedAt: new Date() })
      .where(eq(shiftReplacements.id, id))
  })

  const dateStr = shiftDateForLink as string | null
  const linkUrl = dateStr ? `/replacements?month=${dateStr.slice(0, 7)}` : "/replacements"
  if (requestedByUserId) {
    getAdminIds(orgId).then((adminIds) =>
      createNotification({
        organizationId: orgId,
        actorId: session.user.id,
        recipientIds: [requestedByUserId!, ...adminIds],
        type: response === "accepted" ? "replacement_accepted" : "replacement_rejected",
        title: `Žiadosť o zastúpenie bola ${response === "accepted" ? "prijatá" : "odmietnutá"}`,
        linkUrl,
        referenceId: id,
      }),
    ).catch(console.error)
  }

  revalidatePath("/replacements")
  revalidatePath("/schedule")
}

export async function adminResolveReplacement(id: string, response: "accepted" | "rejected") {
  const session = await requireManagerOrAdmin()
  const orgId = await getOrganizationId()

  let requestedByUserId: string | null = null
  let replacementUserId: string | null = null
  let shiftDateForLink: string | null = null

  await db.transaction(async (tx) => {
    const [replacement] = await tx
      .select()
      .from(shiftReplacements)
      .where(and(eq(shiftReplacements.id, id), eq(shiftReplacements.status, "pending"), eq(shiftReplacements.organizationId, orgId)))
      .limit(1)

    if (!replacement) throw new Error("Žiadosť už bola vybavená")

    requestedByUserId = replacement.requestedByUserId
    replacementUserId = replacement.replacementUserId

    const [shiftRow] = await tx
      .select({ date: shifts.date })
      .from(shifts)
      .where(eq(shifts.id, replacement.shiftId))
      .limit(1)
    shiftDateForLink = shiftRow?.date ?? null

    if (response === "accepted") {
      await tx
        .update(shifts)
        .set({ userId: replacement.replacementUserId, updatedAt: new Date() })
        .where(eq(shifts.id, replacement.shiftId))
    }

    await tx
      .update(shiftReplacements)
      .set({ status: response, updatedAt: new Date() })
      .where(eq(shiftReplacements.id, id))
  })

  const dateStr = shiftDateForLink as string | null
  const linkUrl = dateStr ? `/replacements?month=${dateStr.slice(0, 7)}` : "/replacements"
  if (requestedByUserId && replacementUserId) {
    createNotification({
      organizationId: orgId,
      actorId: session.user.id,
      recipientIds: [requestedByUserId, replacementUserId],
      type: "replacement_resolved",
      title: `Admin ${response === "accepted" ? "schválil" : "zamietol"} žiadosť o zastúpenie`,
      linkUrl,
      referenceId: id,
    }).catch(console.error)
  }

  revalidatePath("/admin/replacements")
  revalidatePath("/replacements")
  revalidatePath("/schedule")
}

export async function adminDeleteReplacement(id: string) {
  await requireManagerOrAdmin()
  const orgId = await getOrganizationId()

  await db.delete(shiftReplacements).where(and(eq(shiftReplacements.id, id), eq(shiftReplacements.organizationId, orgId)))

  revalidatePath("/admin/replacements")
  revalidatePath("/replacements")
}

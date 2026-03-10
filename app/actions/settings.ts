"use server"

import { db } from "@/db"
import { businessHours } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireAdmin, getOrganizationId } from "@/lib/auth-guard"

export type BusinessHoursInput = {
  dayOfWeek: string // "0".."6"
  isClosed: boolean
  openTime?: string // "HH:MM"
  closeTime?: string // "HH:MM"
}[]

export async function getBusinessHours() {
  const orgId = await getOrganizationId()
  const rows = await db
    .select()
    .from(businessHours)
    .where(eq(businessHours.organizationId, orgId))
  return rows
}

export async function updateBusinessHours(data: BusinessHoursInput) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  for (const day of data) {
    const existing = await db
      .select({ id: businessHours.id })
      .from(businessHours)
      .where(and(eq(businessHours.organizationId, orgId), eq(businessHours.dayOfWeek, day.dayOfWeek)))
      .limit(1)

    const values = {
      organizationId: orgId,
      dayOfWeek: day.dayOfWeek,
      isClosed: day.isClosed,
      openTime: day.isClosed ? null : (day.openTime ?? null),
      closeTime: day.isClosed ? null : (day.closeTime ?? null),
      updatedAt: new Date(),
    }

    if (existing.length > 0) {
      await db
        .update(businessHours)
        .set(values)
        .where(and(eq(businessHours.organizationId, orgId), eq(businessHours.dayOfWeek, day.dayOfWeek)))
    } else {
      await db.insert(businessHours).values({ ...values, createdAt: new Date() })
    }
  }

  revalidatePath("/admin/settings")
  revalidatePath("/schedule")
}

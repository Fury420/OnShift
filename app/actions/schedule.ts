"use server"

import { db } from "@/db"
import { shifts } from "@/db/schema"
import { eq, inArray, and, lt, gt, ne } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireAdmin, getOrganizationId } from "@/lib/auth-guard"
import { getSession } from "@/lib/session"
import { toDateStr, addDays } from "@/lib/week"

async function checkConflict(
  userId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string,
) {
  const conditions = [
    eq(shifts.userId, userId),
    eq(shifts.date, date),
    lt(shifts.startTime, endTime),
    gt(shifts.endTime, startTime),
    ...(excludeId ? [ne(shifts.id, excludeId)] : []),
  ]
  const [conflict] = await db
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(...conditions))
    .limit(1)
  if (conflict) throw new Error("Tento zamestnanec má v tomto čase už inú zmenu.")
}

export async function createShift(data: {
  userId: string | null
  date: string
  startTime: string
  endTime: string
  note?: string
}) {
  await requireAdmin()
  const orgId = await getOrganizationId()
  if (data.userId) {
    await checkConflict(data.userId, data.date, data.startTime, data.endTime)
  }

  await db.insert(shifts).values({
    organizationId: orgId,
    userId: data.userId ?? null,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    note: data.note || null,
    status: data.userId ? "draft" : "open",
  })

  revalidatePath("/admin/schedule")
  revalidatePath("/schedule")
}

export async function createShiftsBatch(data: {
  userId: string | null
  dateFrom: string
  dateTo: string
  days: number[] // 0=Sun, 1=Mon, ..., 6=Sat
  excludeDates?: string[] // dates to skip (YYYY-MM-DD)
  startTime: string
  endTime: string
  note?: string
}) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  const excluded = new Set(data.excludeDates ?? [])

  const [fy, fm, fd] = data.dateFrom.split("-").map(Number)
  const [ty, tm, td] = data.dateTo.split("-").map(Number)
  const from = new Date(fy, fm - 1, fd, 12, 0, 0)
  const to = new Date(ty, tm - 1, td, 12, 0, 0)

  let cur = new Date(from)
  let created = 0
  while (toDateStr(cur) <= toDateStr(to)) {
    if (data.days.includes(cur.getDay())) {
      const dateStr = toDateStr(cur)
      if (excluded.has(dateStr)) {
        cur = addDays(cur, 1)
        continue
      }
      if (data.userId) {
        // Skip if conflict exists
        try {
          await checkConflict(data.userId, dateStr, data.startTime, data.endTime)
        } catch {
          cur = addDays(cur, 1)
          continue
        }
      }
      await db.insert(shifts).values({
        organizationId: orgId,
        userId: data.userId ?? null,
        date: dateStr,
        startTime: data.startTime,
        endTime: data.endTime,
        note: data.note || null,
        status: data.userId ? "draft" : "open",
      })
      created++
    }
    cur = addDays(cur, 1)
  }

  revalidatePath("/admin/schedule")
  revalidatePath("/schedule")
  return { created }
}

export async function updateShift(
  id: string,
  data: { userId: string | null; date: string; startTime: string; endTime: string; note?: string },
) {
  await requireAdmin()
  const orgId = await getOrganizationId()
  if (data.userId) {
    await checkConflict(data.userId, data.date, data.startTime, data.endTime, id)
  }

  await db
    .update(shifts)
    .set({
      userId: data.userId ?? null,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      note: data.note || null,
      status: data.userId ? "draft" : "open",
      updatedAt: new Date(),
    })
    .where(and(eq(shifts.id, id), eq(shifts.organizationId, orgId)))

  revalidatePath("/admin/schedule")
  revalidatePath("/schedule")
}

export async function requestShift(data: {
  date: string
  startTime: string
  endTime: string
  note?: string
}) {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený")
  const orgId = await getOrganizationId()
  const userId = session.user.id

  await checkConflict(userId, data.date, data.startTime, data.endTime)

  await db.insert(shifts).values({
    organizationId: orgId,
    userId,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    note: data.note || null,
    status: "requested",
  })

  revalidatePath("/schedule")
  revalidatePath("/admin/schedule")
}

export async function approveShiftRequest(id: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db
    .update(shifts)
    .set({ status: "published", updatedAt: new Date() })
    .where(and(eq(shifts.id, id), eq(shifts.organizationId, orgId)))

  revalidatePath("/admin/schedule")
  revalidatePath("/schedule")
}

export async function rejectShiftRequest(id: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db.delete(shifts).where(and(eq(shifts.id, id), eq(shifts.organizationId, orgId)))

  revalidatePath("/admin/schedule")
  revalidatePath("/schedule")
}

export async function claimShift(shiftId: string) {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený")
  const orgId = await getOrganizationId()
  const userId = session.user.id

  const [shift] = await db
    .select({ id: shifts.id, startTime: shifts.startTime, endTime: shifts.endTime, date: shifts.date, maxClaims: shifts.maxClaims })
    .from(shifts)
    .where(and(eq(shifts.id, shiftId), eq(shifts.organizationId, orgId), eq(shifts.status, "open")))
    .limit(1)
  if (!shift) throw new Error("Zmena nie je dostupná")

  await checkConflict(userId, shift.date, shift.startTime, shift.endTime)

  // Count published shifts matching this open shift's time slot
  const claimedShifts = await db
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(eq(shifts.organizationId, orgId), eq(shifts.status, "published"), eq(shifts.date, shift.date), eq(shifts.startTime, shift.startTime), eq(shifts.endTime, shift.endTime)))
  if (claimedShifts.length >= shift.maxClaims) throw new Error("Zmena je už plne obsadená")

  await db.insert(shifts).values({
    organizationId: orgId,
    userId,
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    status: "published",
  })

  revalidatePath("/schedule")
  revalidatePath("/admin/schedule")
}

export async function claimRuleShift(ruleId: string, date: string, startTime: string, endTime: string, maxClaims?: number) {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený")
  const orgId = await getOrganizationId()
  const userId = session.user.id

  await checkConflict(userId, date, startTime, endTime)

  const mc = maxClaims ?? 1

  // Count published shifts matching this time slot
  const claimedShifts = await db
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(eq(shifts.organizationId, orgId), eq(shifts.status, "published"), eq(shifts.date, date), eq(shifts.startTime, startTime), eq(shifts.endTime, endTime)))
  if (claimedShifts.length >= mc) throw new Error("Zmena je už plne obsadená")

  await db.insert(shifts).values({
    organizationId: orgId,
    userId,
    date,
    startTime,
    endTime,
    status: "published",
  })

  revalidatePath("/schedule")
  revalidatePath("/admin/schedule")
}

export async function deleteShift(id: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db.delete(shifts).where(and(eq(shifts.id, id), eq(shifts.organizationId, orgId)))

  revalidatePath("/admin/schedule")
  revalidatePath("/schedule")
}

export async function toggleShiftStatus(id: string, current: "requested" | "draft" | "open" | "published") {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db
    .update(shifts)
    .set({ status: current === "draft" ? "published" : "draft", updatedAt: new Date() })
    .where(and(eq(shifts.id, id), eq(shifts.organizationId, orgId)))

  revalidatePath("/admin/schedule")
  revalidatePath("/schedule")
}

export async function publishDraftShifts(ids: string[]) {
  await requireAdmin()
  const orgId = await getOrganizationId()
  if (ids.length === 0) return

  await db
    .update(shifts)
    .set({ status: "published", updatedAt: new Date() })
    .where(and(inArray(shifts.id, ids), eq(shifts.organizationId, orgId)))

  revalidatePath("/admin/schedule")
  revalidatePath("/schedule")
}

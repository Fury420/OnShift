"use server"

import { db } from "@/db"
import { shifts, openShiftClaims } from "@/db/schema"
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

  // Check shift exists and is open
  const [shift] = await db
    .select({ id: shifts.id, status: shifts.status, startTime: shifts.startTime, endTime: shifts.endTime, date: shifts.date })
    .from(shifts)
    .where(and(eq(shifts.id, shiftId), eq(shifts.organizationId, orgId), eq(shifts.status, "open")))
    .limit(1)
  if (!shift) throw new Error("Zmena nie je dostupná")

  // Check no existing pending claim by this user
  const [existingClaim] = await db
    .select({ id: openShiftClaims.id })
    .from(openShiftClaims)
    .where(and(eq(openShiftClaims.shiftId, shiftId), eq(openShiftClaims.claimedByUserId, userId), eq(openShiftClaims.status, "pending")))
    .limit(1)
  if (existingClaim) throw new Error("Už ste sa na túto zmenu prihlásili")

  // Check no shift conflict
  await checkConflict(userId, shift.date, shift.startTime, shift.endTime)

  await db.insert(openShiftClaims).values({
    organizationId: orgId,
    shiftId,
    claimedByUserId: userId,
    status: "pending",
  })

  revalidatePath("/schedule")
  revalidatePath("/admin/schedule")
}

export async function claimRuleShift(ruleId: string, date: string, startTime: string, endTime: string) {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený")
  const orgId = await getOrganizationId()
  const userId = session.user.id

  await checkConflict(userId, date, startTime, endTime)

  const [newShift] = await db.insert(shifts).values({
    organizationId: orgId,
    userId: null,
    date,
    startTime,
    endTime,
    status: "open",
  }).returning({ id: shifts.id })

  await db.insert(openShiftClaims).values({
    organizationId: orgId,
    shiftId: newShift.id,
    claimedByUserId: userId,
    status: "pending",
  })

  revalidatePath("/schedule")
  revalidatePath("/admin/schedule")
}

export async function approveShiftClaim(claimId: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  const [claim] = await db
    .select({ id: openShiftClaims.id, shiftId: openShiftClaims.shiftId, claimedByUserId: openShiftClaims.claimedByUserId })
    .from(openShiftClaims)
    .where(and(eq(openShiftClaims.id, claimId), eq(openShiftClaims.organizationId, orgId)))
    .limit(1)
  if (!claim) throw new Error("Prihlásenie nenájdené")

  await db
    .update(shifts)
    .set({ userId: claim.claimedByUserId, status: "published", updatedAt: new Date() })
    .where(and(eq(shifts.id, claim.shiftId), eq(shifts.organizationId, orgId)))

  await db
    .update(openShiftClaims)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(openShiftClaims.id, claimId))

  // Reject all other pending claims for the same shift
  await db
    .update(openShiftClaims)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(and(eq(openShiftClaims.shiftId, claim.shiftId), ne(openShiftClaims.id, claimId), eq(openShiftClaims.status, "pending")))

  revalidatePath("/admin/schedule")
  revalidatePath("/schedule")
}

export async function rejectShiftClaim(claimId: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db
    .update(openShiftClaims)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(and(eq(openShiftClaims.id, claimId), eq(openShiftClaims.organizationId, orgId)))

  revalidatePath("/admin/schedule")
  revalidatePath("/schedule")
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

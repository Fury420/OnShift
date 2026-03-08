"use server"

import { db } from "@/db"
import { shifts, openShiftClaims } from "@/db/schema"
import { eq, inArray, and, lt, gt, ne, isNotNull, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireAdmin, getOrganizationId } from "@/lib/auth-guard"
import { getSession } from "@/lib/session"
import { toDateStr, addDays } from "@/lib/week"

function revalidateSchedule() {
  revalidatePath("/admin/schedule")
  revalidatePath("/schedule")
}

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

// ─── Create shift ───────────────────────────────────────────────────────────

export async function createShift(data: {
  userId: string | null
  date: string
  startTime: string
  endTime: string
  note?: string
  maxClaims?: number
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
    maxClaims: data.maxClaims ?? 1,
    status: "draft",
  })

  revalidateSchedule()
}

// ─── Create shifts batch ────────────────────────────────────────────────────

export async function createShiftsBatch(data: {
  userId: string | null
  dateFrom: string
  dateTo: string
  days: number[] // 0=Sun, 1=Mon, ..., 6=Sat
  excludeDates?: string[] // dates to skip (YYYY-MM-DD)
  startTime: string
  endTime: string
  note?: string
  maxClaims?: number
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
        maxClaims: data.maxClaims ?? 1,
        status: "draft",
      })
      created++
    }
    cur = addDays(cur, 1)
  }

  revalidateSchedule()
  return { created }
}

// ─── Update shift ───────────────────────────────────────────────────────────

export async function updateShift(
  id: string,
  data: { userId: string | null; date: string; startTime: string; endTime: string; note?: string; maxClaims?: number },
) {
  await requireAdmin()
  const orgId = await getOrganizationId()
  if (data.userId) {
    await checkConflict(data.userId, data.date, data.startTime, data.endTime, id)
  }

  // If changing from open to assigned, remove existing claims
  if (data.userId) {
    await db.delete(openShiftClaims).where(eq(openShiftClaims.shiftId, id))
  }

  // Status: priradená zmena → vždy draft; voľná zmena → ponechať aktuálny status (draft zostane draft, open zostane open)
  const [current] = await db
    .select({ status: shifts.status })
    .from(shifts)
    .where(and(eq(shifts.id, id), eq(shifts.organizationId, orgId)))
    .limit(1)
  const newStatus = data.userId ? "draft" : (current?.status === "open" ? "open" : "draft")

  await db
    .update(shifts)
    .set({
      userId: data.userId ?? null,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      note: data.note || null,
      maxClaims: data.maxClaims ?? 1,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(shifts.id, id), eq(shifts.organizationId, orgId)))

  revalidateSchedule()
}

// ─── Claim open shift (employee, auto-approved) ─────────────────────────────

export async function claimShift(shiftId: string) {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený")
  const orgId = await getOrganizationId()
  const userId = session.user.id

  // Find the open shift
  const [shift] = await db
    .select({ id: shifts.id, startTime: shifts.startTime, endTime: shifts.endTime, date: shifts.date, maxClaims: shifts.maxClaims })
    .from(shifts)
    .where(and(eq(shifts.id, shiftId), eq(shifts.organizationId, orgId), eq(shifts.status, "open")))
    .limit(1)
  if (!shift) throw new Error("Zmena nie je dostupná")

  // Check for time conflict
  await checkConflict(userId, shift.date, shift.startTime, shift.endTime)

  // Check if user already claimed this shift
  const [existingClaim] = await db
    .select({ id: openShiftClaims.id })
    .from(openShiftClaims)
    .where(and(eq(openShiftClaims.shiftId, shiftId), eq(openShiftClaims.claimedByUserId, userId)))
    .limit(1)
  if (existingClaim) throw new Error("Túto zmenu ste už obsadili")

  // Count approved claims for this shift
  const approvedClaims = await db
    .select({ id: openShiftClaims.id })
    .from(openShiftClaims)
    .where(and(eq(openShiftClaims.shiftId, shiftId), eq(openShiftClaims.status, "approved")))
  if (approvedClaims.length >= shift.maxClaims) throw new Error("Zmena je už plne obsadená")

  // Create claim (auto-approved)
  await db.insert(openShiftClaims).values({
    organizationId: orgId,
    shiftId,
    claimedByUserId: userId,
    status: "approved",
  })

  revalidateSchedule()
}

// ─── Unclaim shift (employee removes their own claim) ───────────────────────

export async function unclaimShift(shiftId: string) {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený")
  const userId = session.user.id

  await db
    .delete(openShiftClaims)
    .where(and(eq(openShiftClaims.shiftId, shiftId), eq(openShiftClaims.claimedByUserId, userId)))

  revalidateSchedule()
}

// ─── Admin: remove a claim ──────────────────────────────────────────────────

export async function adminRemoveClaim(claimId: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db
    .delete(openShiftClaims)
    .where(and(eq(openShiftClaims.id, claimId), eq(openShiftClaims.organizationId, orgId)))

  revalidateSchedule()
}

// ─── Delete shift ───────────────────────────────────────────────────────────

export async function deleteShift(id: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db.delete(shifts).where(and(eq(shifts.id, id), eq(shifts.organizationId, orgId)))

  revalidateSchedule()
}

// ─── Toggle shift status (draft ↔ published) ────────────────────────────────

export async function toggleShiftStatus(id: string, current: "draft" | "open" | "published") {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db
    .update(shifts)
    .set({ status: current === "draft" ? "published" : "draft", updatedAt: new Date() })
    .where(and(eq(shifts.id, id), eq(shifts.organizationId, orgId)))

  revalidateSchedule()
}

// ─── Publish all draft shifts ───────────────────────────────────────────────
// Priradené zmeny → published, voľné zmeny → open (viditeľné pre zamestnancov)

export async function publishDraftShifts(ids: string[]) {
  await requireAdmin()
  const orgId = await getOrganizationId()
  if (ids.length === 0) return

  const base = and(inArray(shifts.id, ids), eq(shifts.organizationId, orgId))
  await db
    .update(shifts)
    .set({ status: "published", updatedAt: new Date() })
    .where(and(base, isNotNull(shifts.userId)))
  await db
    .update(shifts)
    .set({ status: "open", updatedAt: new Date() })
    .where(and(base, isNull(shifts.userId)))

  revalidateSchedule()
}

// ─── Delete all draft shifts (koncepty) ────────────────────────────────────

export async function deleteAllDraftShifts(ids: string[]) {
  await requireAdmin()
  const orgId = await getOrganizationId()
  if (ids.length === 0) return

  await db
    .delete(shifts)
    .where(and(inArray(shifts.id, ids), eq(shifts.organizationId, orgId), eq(shifts.status, "draft")))

  revalidateSchedule()
}

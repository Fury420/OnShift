"use server"

import { db } from "@/db"
import { shifts, openShiftClaims, leaves, user } from "@/db/schema"
import { eq, inArray, and, lt, gt, ne, isNotNull, isNull, lte, gte } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireAdmin, getOrganizationId } from "@/lib/auth-guard"
import { getSession } from "@/lib/session"
import { toDateStr, addDays } from "@/lib/week"
import { createNotification, getOrgEmployeeIds } from "@/lib/notifications"

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

async function checkLeaveOverlap(organizationId: string, userId: string, date: string): Promise<boolean> {
  const [overlap] = await db
    .select({ id: leaves.id })
    .from(leaves)
    .where(
      and(
        eq(leaves.organizationId, organizationId),
        eq(leaves.userId, userId),
        eq(leaves.status, "approved"),
        lte(leaves.startDate, date),
        gte(leaves.endDate, date),
      ),
    )
    .limit(1)
  return !!overlap
}

// ─── Create shift ───────────────────────────────────────────────────────────

export async function createShift(data: {
  userId: string | null
  positionId?: string | null
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
    if (await checkLeaveOverlap(orgId, data.userId, data.date)) {
      throw new Error("Zamestnanec má v tento deň schválené voľno (dovolenka). Zmenu nie je možné naplánovať.")
    }
  }

  await db.insert(shifts).values({
    organizationId: orgId,
    userId: data.userId ?? null,
    positionId: data.positionId ?? null,
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
  positionId?: string | null
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
        if (await checkLeaveOverlap(orgId, data.userId, dateStr)) {
          cur = addDays(cur, 1)
          continue
        }
      }
      await db.insert(shifts).values({
        organizationId: orgId,
        userId: data.userId ?? null,
        positionId: data.positionId ?? null,
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
  data: { userId: string | null; positionId?: string | null; date: string; startTime: string; endTime: string; note?: string; maxClaims?: number },
) {
  const session = await requireAdmin()
  const orgId = await getOrganizationId()
  if (data.userId) {
    await checkConflict(data.userId, data.date, data.startTime, data.endTime, id)
    if (await checkLeaveOverlap(orgId, data.userId, data.date)) {
      throw new Error("Zamestnanec má v tento deň schválené voľno (dovolenka). Zmenu nie je možné naplánovať.")
    }
  }

  // If changing from open to assigned, remove existing claims
  if (data.userId) {
    await db.delete(openShiftClaims).where(eq(openShiftClaims.shiftId, id))
  }

  // Status: priradená zmena → vždy draft; neobsadená zmena → ponechať aktuálny status (draft zostane draft, open zostane open)
  const [current] = await db
    .select({ status: shifts.status, userId: shifts.userId })
    .from(shifts)
    .where(and(eq(shifts.id, id), eq(shifts.organizationId, orgId)))
    .limit(1)
  const newStatus = data.userId ? "draft" : (current?.status === "open" ? "open" : "draft")

  await db
    .update(shifts)
    .set({
      userId: data.userId ?? null,
      positionId: data.positionId ?? null,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      note: data.note || null,
      maxClaims: data.maxClaims ?? 1,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(shifts.id, id), eq(shifts.organizationId, orgId)))

  // Notify affected employee(s)
  const notifyIds: string[] = []
  if (data.userId && data.userId !== current?.userId) notifyIds.push(data.userId)
  if (current?.userId && current.userId !== data.userId) notifyIds.push(current.userId)
  if (notifyIds.length > 0) {
    createNotification({
      organizationId: orgId,
      actorId: session.user.id,
      recipientIds: notifyIds,
      type: "shift_modified",
      title: `Zmena na ${data.date} bola upravená`,
      linkUrl: `/schedule?month=${data.date.slice(0, 7)}&date=${data.date}`,
      referenceId: id,
    }).catch(console.error)
  }

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
    .select({ id: shifts.id, startTime: shifts.startTime, endTime: shifts.endTime, date: shifts.date, maxClaims: shifts.maxClaims, positionId: shifts.positionId })
    .from(shifts)
    .where(and(eq(shifts.id, shiftId), eq(shifts.organizationId, orgId), eq(shifts.status, "open")))
    .limit(1)
  if (!shift) throw new Error("Zmena nie je dostupná")

  // Check position match
  if (shift.positionId) {
    const [emp] = await db.select({ positionId: user.positionId }).from(user).where(eq(user.id, userId)).limit(1)
    if (emp?.positionId !== shift.positionId) throw new Error("Táto zmena vyžaduje inú pozíciu")
  }

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
  const session = await requireAdmin()
  const orgId = await getOrganizationId()

  const newStatus = current === "draft" ? "published" : "draft"

  // Get shift's assigned user before toggling
  const [shift] = await db
    .select({ userId: shifts.userId, date: shifts.date })
    .from(shifts)
    .where(and(eq(shifts.id, id), eq(shifts.organizationId, orgId)))
    .limit(1)

  await db
    .update(shifts)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(and(eq(shifts.id, id), eq(shifts.organizationId, orgId)))

  // Notify when publishing (draft → published)
  if (newStatus === "published" && shift?.userId) {
    const dateLabel = new Date(shift.date + "T12:00:00").toLocaleDateString("sk-SK", {
      weekday: "short",
      day: "numeric",
      month: "numeric",
    })
    createNotification({
      organizationId: orgId,
      actorId: session.user.id,
      recipientIds: [shift.userId],
      type: "shift_assigned",
      title: "Bola ti pridelená zmena",
      body: dateLabel,
      linkUrl: `/schedule?month=${shift.date.slice(0, 7)}&date=${shift.date}`,
      referenceId: id,
    }).catch(console.error)
  }

  revalidateSchedule()
}

// ─── Publish all draft shifts ───────────────────────────────────────────────
// Priradené zmeny → published, neobsadené zmeny → open (viditeľné pre zamestnancov)

export async function publishDraftShifts(ids: string[]) {
  const session = await requireAdmin()
  const orgId = await getOrganizationId()
  if (ids.length === 0) return

  // Query affected shifts before publishing
  const affectedShifts = await db
    .select({ userId: shifts.userId })
    .from(shifts)
    .where(and(inArray(shifts.id, ids), eq(shifts.organizationId, orgId)))

  const assignedUserIds = [...new Set(affectedShifts.filter((s) => s.userId).map((s) => s.userId!))]
  const hasOpenShifts = affectedShifts.some((s) => !s.userId)

  const base = and(inArray(shifts.id, ids), eq(shifts.organizationId, orgId))
  await db
    .update(shifts)
    .set({ status: "published", updatedAt: new Date() })
    .where(and(base, isNotNull(shifts.userId)))
  await db
    .update(shifts)
    .set({ status: "open", updatedAt: new Date() })
    .where(and(base, isNull(shifts.userId)))

  // Notify assigned employees
  if (assignedUserIds.length > 0) {
    createNotification({
      organizationId: orgId,
      actorId: session.user.id,
      recipientIds: assignedUserIds,
      type: "drafts_published",
      title: "Boli publikované nové zmeny v rozvrhu",
      linkUrl: "/schedule",
    }).catch(console.error)
  }

  // Notify all employees about open shifts
  if (hasOpenShifts) {
    getOrgEmployeeIds(orgId).then((employeeIds) =>
      createNotification({
        organizationId: orgId,
        actorId: session.user.id,
        recipientIds: employeeIds,
        type: "open_shift_published",
        title: "K dispozícii sú nové neobsadené zmeny",
        linkUrl: "/schedule",
      }),
    ).catch(console.error)
  }

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

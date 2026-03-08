"use server"

import { db } from "@/db"
import { shiftRules, shiftExceptions } from "@/db/schema"
import { eq, and, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireAdmin, getOrganizationId } from "@/lib/auth-guard"
import { getSession } from "@/lib/session"

function revalidateSchedule() {
  revalidatePath("/admin/schedule")
  revalidatePath("/schedule")
}

// ─── Create rule ─────────────────────────────────────────────────────────────

export async function createShiftRule(data: {
  userId: string | null
  frequency: "once" | "weekly" | "monthly"
  // once
  date?: string
  // weekly
  days?: string
  // monthly
  dayOfMonth?: string
  // recurring range
  validFrom?: string
  validUntil?: string
  // time
  startTime?: string
  endTime?: string
  allDay: boolean
  note?: string
  maxClaims?: number
}) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  try {
    await db.insert(shiftRules).values({
      organizationId: orgId,
      userId: data.userId ?? null,
      frequency: data.frequency,
      date: data.frequency === "once" ? (data.date ?? null) : null,
      days: data.frequency === "weekly" ? (data.days ?? null) : null,
      dayOfMonth: data.frequency === "monthly" ? (data.dayOfMonth ?? null) : null,
      validFrom: data.frequency !== "once" ? (data.validFrom ?? null) : null,
      validUntil: data.frequency !== "once" ? (data.validUntil ?? null) : null,
      startTime: data.allDay ? null : (data.startTime ?? null),
      endTime: data.allDay ? null : (data.endTime ?? null),
      allDay: data.allDay,
      note: data.note || null,
      maxClaims: data.maxClaims ?? 1,
      status: data.userId ? "draft" : "open",
    })
  } catch {
    // Fallback: DB nemá stĺpec max_claims (migrácia 0011 ešte nebola spustená)
    await db.execute(sql`
      INSERT INTO shift_rules
        (organization_id, user_id, frequency, date, days, day_of_month, valid_from, valid_until, start_time, end_time, all_day, note, status)
      VALUES (
        ${orgId},
        ${data.userId ?? null},
        ${data.frequency},
        ${data.frequency === "once" ? (data.date ?? null) : null},
        ${data.frequency === "weekly" ? (data.days ?? null) : null},
        ${null},
        ${data.frequency !== "once" ? (data.validFrom ?? null) : null},
        ${data.frequency !== "once" ? (data.validUntil ?? null) : null},
        ${data.allDay ? null : (data.startTime ?? null)},
        ${data.allDay ? null : (data.endTime ?? null)},
        ${data.allDay},
        ${data.note || null},
        ${data.userId ? "draft" : "open"}
      )
    `)
  }

  revalidateSchedule()
}

// ─── Update rule ─────────────────────────────────────────────────────────────

export async function updateShiftRule(
  id: string,
  data: {
    userId?: string | null
    frequency?: "once" | "weekly" | "monthly"
    date?: string | null
    days?: string | null
    dayOfMonth?: string | null
    validFrom?: string | null
    validUntil?: string | null
    startTime?: string | null
    endTime?: string | null
    allDay?: boolean
    note?: string | null
  },
) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db
    .update(shiftRules)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(shiftRules.id, id), eq(shiftRules.organizationId, orgId)))

  revalidateSchedule()
}

// ─── Delete rule (and all exceptions) ────────────────────────────────────────

export async function deleteShiftRule(id: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db.delete(shiftRules).where(and(eq(shiftRules.id, id), eq(shiftRules.organizationId, orgId)))

  revalidateSchedule()
}

// ─── Skip a single instance ──────────────────────────────────────────────────

export async function skipRuleInstance(ruleId: string, date: string) {
  await requireAdmin()

  // Upsert: if exception already exists for this rule+date, update it
  const [existing] = await db
    .select({ id: shiftExceptions.id })
    .from(shiftExceptions)
    .where(and(eq(shiftExceptions.ruleId, ruleId), eq(shiftExceptions.date, date)))
    .limit(1)

  if (existing) {
    await db
      .update(shiftExceptions)
      .set({ action: "skip" })
      .where(eq(shiftExceptions.id, existing.id))
  } else {
    await db.insert(shiftExceptions).values({
      ruleId,
      date,
      action: "skip",
    })
  }

  revalidateSchedule()
}

// ─── Modify a single instance ────────────────────────────────────────────────

export async function modifyRuleInstance(
  ruleId: string,
  date: string,
  overrides: {
    userId?: string | null
    startTime?: string
    endTime?: string
    note?: string
  },
) {
  await requireAdmin()

  const [existing] = await db
    .select({ id: shiftExceptions.id })
    .from(shiftExceptions)
    .where(and(eq(shiftExceptions.ruleId, ruleId), eq(shiftExceptions.date, date)))
    .limit(1)

  if (existing) {
    await db
      .update(shiftExceptions)
      .set({ action: "modify", ...overrides })
      .where(eq(shiftExceptions.id, existing.id))
  } else {
    await db.insert(shiftExceptions).values({
      ruleId,
      date,
      action: "modify",
      userId: overrides.userId ?? null,
      startTime: overrides.startTime ?? null,
      endTime: overrides.endTime ?? null,
      note: overrides.note ?? null,
    })
  }

  revalidateSchedule()
}

// ─── Remove exception (restore original instance) ────────────────────────────

export async function removeException(exceptionId: string) {
  await requireAdmin()

  await db.delete(shiftExceptions).where(eq(shiftExceptions.id, exceptionId))

  revalidateSchedule()
}

// ─── Employee: request shift rule ────────────────────────────────────────────

export async function requestShiftRule(data: {
  frequency: "once" | "weekly"
  date?: string
  days?: string
  validFrom?: string
  validUntil?: string
  startTime?: string
  endTime?: string
  allDay: boolean
  note?: string
}) {
  const session = await getSession()
  if (!session) throw new Error("Nie ste prihlásený")
  const orgId = await getOrganizationId()
  const userId = session.user.id

  await db.insert(shiftRules).values({
    organizationId: orgId,
    userId,
    frequency: data.frequency,
    date: data.frequency === "once" ? (data.date ?? null) : null,
    days: data.frequency === "weekly" ? (data.days ?? null) : null,
    dayOfMonth: null,
    validFrom: data.frequency !== "once" ? (data.validFrom ?? null) : null,
    validUntil: data.frequency !== "once" ? (data.validUntil ?? null) : null,
    startTime: data.allDay ? null : (data.startTime ?? null),
    endTime: data.allDay ? null : (data.endTime ?? null),
    allDay: data.allDay,
    note: data.note || null,
    status: "requested",
  })

  revalidateSchedule()
}

// ─── Admin: approve / reject rule request ────────────────────────────────────

export async function approveShiftRuleRequest(id: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db
    .update(shiftRules)
    .set({ status: "draft", updatedAt: new Date() })
    .where(and(eq(shiftRules.id, id), eq(shiftRules.organizationId, orgId)))

  revalidateSchedule()
}

export async function rejectShiftRuleRequest(id: string) {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db.delete(shiftRules).where(and(eq(shiftRules.id, id), eq(shiftRules.organizationId, orgId)))

  revalidateSchedule()
}

// ─── Publish / unpublish rule ────────────────────────────────────────────────

export async function toggleShiftRuleStatus(id: string, currentStatus: "draft" | "published") {
  await requireAdmin()
  const orgId = await getOrganizationId()

  await db
    .update(shiftRules)
    .set({
      status: currentStatus === "draft" ? "published" : "draft",
      updatedAt: new Date(),
    })
    .where(and(eq(shiftRules.id, id), eq(shiftRules.organizationId, orgId)))

  revalidateSchedule()
}

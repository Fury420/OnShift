export const dynamic = "force-dynamic"

import { db } from "@/db"
import { shifts, user, leaves, businessHours, openShiftClaims, shiftRules, shiftExceptions } from "@/db/schema"
import { eq, and, gte, lte, asc, or } from "drizzle-orm"
import { getSession } from "@/lib/session"
import { getOrganizationId } from "@/lib/auth-guard"
import { redirect } from "next/navigation"
import { MonthCalendar, type CalendarDay, type CalendarShift, type OpenShift, type RequestedShift } from "@/components/schedule/month-calendar"
import { getMonthGrid, toDateStr, formatMonthLabel, shortTime } from "@/lib/week"
import { expandRules, type ShiftRule, type ShiftException } from "@/lib/expand-rules"

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const session = await getSession()
  if (!session) redirect("/login")

  const sessionUser = session.user as { role?: string; organizationId?: string | null }
  const isAdmin = sessionUser.role === "admin"
  const orgId = await getOrganizationId()

  const { month } = await searchParams
  const { year, monthNum, weeks } = getMonthGrid(month)

  const startDate = toDateStr(weeks[0][0])
  const endDate = toDateStr(weeks[weeks.length - 1][6])
  const todayStr = toDateStr(new Date())

  const [monthShifts, openMonthShifts, requestedShifts, pendingClaims, employees, approvedLeaves, orgBusinessHours, rules, exceptions] = await Promise.all([
    db
      .select({
        id: shifts.id,
        userId: shifts.userId,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        note: shifts.note,
      })
      .from(shifts)
      .where(
        and(
          eq(shifts.organizationId, orgId),
          eq(shifts.status, "published"),
          gte(shifts.date, startDate),
          lte(shifts.date, endDate),
        ),
      )
      .orderBy(asc(shifts.startTime)),

    db
      .select({
        id: shifts.id,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        note: shifts.note,
        maxClaims: shifts.maxClaims,
      })
      .from(shifts)
      .where(and(eq(shifts.organizationId, orgId), eq(shifts.status, "open"), gte(shifts.date, startDate), lte(shifts.date, endDate)))
      .orderBy(asc(shifts.startTime)),

    db
      .select({ id: shifts.id, date: shifts.date, startTime: shifts.startTime, endTime: shifts.endTime, note: shifts.note })
      .from(shifts)
      .where(and(eq(shifts.organizationId, orgId), eq(shifts.status, "requested"), eq(shifts.userId, session.user.id), gte(shifts.date, startDate), lte(shifts.date, endDate)))
      .orderBy(asc(shifts.startTime)),

    db
      .select({
        id: openShiftClaims.id,
        shiftId: openShiftClaims.shiftId,
        claimedByUserId: openShiftClaims.claimedByUserId,
        status: openShiftClaims.status,
      })
      .from(openShiftClaims)
      .where(eq(openShiftClaims.organizationId, orgId)),

    db
      .select({ id: user.id, name: user.name, color: user.color })
      .from(user)
      .where(eq(user.organizationId, orgId))
      .orderBy(asc(user.name)),

    db
      .select({ userId: leaves.userId, startDate: leaves.startDate, endDate: leaves.endDate })
      .from(leaves)
      .where(and(eq(leaves.organizationId, orgId), eq(leaves.status, "approved"), lte(leaves.startDate, endDate), gte(leaves.endDate, startDate))),

    db
      .select()
      .from(businessHours)
      .where(eq(businessHours.organizationId, orgId)),

    // Fetch published + open shift rules that overlap with visible range
    db
      .select()
      .from(shiftRules)
      .where(
        and(
          eq(shiftRules.organizationId, orgId),
          or(eq(shiftRules.status, "published"), eq(shiftRules.status, "open")),
          or(
            and(eq(shiftRules.frequency, "once"), gte(shiftRules.date, startDate), lte(shiftRules.date, endDate)),
            and(
              or(eq(shiftRules.frequency, "weekly"), eq(shiftRules.frequency, "monthly")),
              lte(shiftRules.validFrom, endDate),
              gte(shiftRules.validUntil, startDate),
            ),
          ),
        ),
      ),

    db
      .select()
      .from(shiftExceptions)
      .where(and(gte(shiftExceptions.date, startDate), lte(shiftExceptions.date, endDate))),
  ])

  const onLeave = (userId: string, date: string) =>
    approvedLeaves.some((l) => l.userId === userId && l.startDate <= date && l.endDate >= date)

  const bhMap = new Map(orgBusinessHours.map((r) => [r.dayOfWeek, r]))

  // Expand rules into virtual instances
  const ruleData: ShiftRule[] = rules.map((r) => ({
    id: r.id, organizationId: r.organizationId, userId: r.userId, frequency: r.frequency,
    date: r.date, days: r.days, dayOfMonth: r.dayOfMonth, validFrom: r.validFrom, validUntil: r.validUntil,
    startTime: r.startTime, endTime: r.endTime, allDay: r.allDay, maxClaims: r.maxClaims ?? 1, note: r.note, status: r.status,
  }))
  const exData: ShiftException[] = exceptions.map((e) => ({
    id: e.id, ruleId: e.ruleId, date: e.date, action: e.action,
    userId: e.userId, startTime: e.startTime, endTime: e.endTime, note: e.note,
  }))
  const ruleInstances = expandRules(ruleData, exData, startDate, endDate, bhMap)

  const visibleShifts = monthShifts.filter((s) => !s.userId || !onLeave(s.userId, s.date))

  const colorMap = new Map(
    employees.map((e) => ({ id: e.id, name: e.name, color: e.color ?? "#6b7280" }))
      .map((e) => [e.id, e]),
  )

  // Build a set of concrete open shift IDs that were created for rule-based claims
  // so we can merge their claim data into rule instances and avoid duplicates
  const concreteShiftsByKey = new Map<string, typeof openMonthShifts[number]>()
  for (const s of openMonthShifts) {
    const key = `${s.date}:${shortTime(s.startTime)}:${shortTime(s.endTime)}`
    concreteShiftsByKey.set(key, s)
  }

  // Track which concrete open shifts are consumed by rule instances
  const consumedConcreteIds = new Set<string>()

  const calendarWeeks: CalendarDay[][] = weeks.map((week) =>
    week.map((date) => {
      const dateStr = toDateStr(date)
      // Legacy published shifts
      const legacyShifts: CalendarShift[] = visibleShifts
        .filter((s) => s.date === dateStr)
        .map((s) => {
          const emp = s.userId ? colorMap.get(s.userId) : undefined
          return {
            id: s.id,
            userId: s.userId ?? "",
            userName: emp?.name ?? "—",
            startTime: shortTime(s.startTime),
            endTime: shortTime(s.endTime),
            note: s.note,
            color: emp?.color ?? "#6b7280",
            isCurrentUser: s.userId === session.user.id,
            canRequest: isAdmin || s.userId === session.user.id,
          }
        })

      // Rule-based published shifts (non-open, with userId)
      const ruleShifts: CalendarShift[] = ruleInstances
        .filter((ri) => ri.date === dateStr && ri.status === "published" && ri.userId && !onLeave(ri.userId!, dateStr))
        .map((ri) => {
          const emp = ri.userId ? colorMap.get(ri.userId) : undefined
          return {
            id: `rule:${ri.ruleId}:${dateStr}`,
            userId: ri.userId ?? "",
            userName: emp?.name ?? "—",
            startTime: ri.startTime,
            endTime: ri.endTime,
            note: ri.note,
            color: emp?.color ?? "#6b7280",
            isCurrentUser: ri.userId === session.user.id,
            canRequest: isAdmin || ri.userId === session.user.id,
          }
        })

      const dayShifts = [...legacyShifts, ...ruleShifts]

      // Rule-based open shifts — merge claim data from concrete shifts
      const ruleOpenShifts: OpenShift[] = ruleInstances
        .filter((ri) => ri.date === dateStr && (ri.status === "open" || (ri.status === "published" && !ri.userId)))
        .map((ri) => {
          const mc = ri.maxClaims ?? 1
          // Find a matching concrete open shift (created by claimRuleShift)
          const key = `${dateStr}:${ri.startTime}:${ri.endTime}`
          const concreteShift = concreteShiftsByKey.get(key)
          let acceptedCount = 0
          let claimedByUsers: OpenShift["claimedByUsers"] = []
          let myClaimId: string | null = null
          let iMayClaim = true

          if (concreteShift) {
            consumedConcreteIds.add(concreteShift.id)
            const allClaims = pendingClaims.filter((c) => c.shiftId === concreteShift.id)
            const acceptedClaims = allClaims.filter((c) => c.status === "approved")
            const myClaim = allClaims.find((c) => c.claimedByUserId === session.user.id)
            acceptedCount = acceptedClaims.length
            claimedByUsers = acceptedClaims.map((c) => {
              const emp = colorMap.get(c.claimedByUserId)
              return { userId: c.claimedByUserId, userName: emp?.name ?? "—", color: emp?.color ?? "#6b7280", claimId: c.id }
            })
            myClaimId = myClaim?.id ?? null
            iMayClaim = !myClaim && acceptedCount < mc
          }

          return {
            id: `rule:${ri.ruleId}:${dateStr}`,
            startTime: ri.startTime,
            endTime: ri.endTime,
            note: ri.note,
            maxClaims: mc,
            acceptedCount,
            claimedByUsers,
            myClaimId,
            iMayClaim,
          }
        })

      // Legacy open shifts — exclude those consumed by rule instances
      const legacyOpenShifts: OpenShift[] = openMonthShifts
        .filter((s) => s.date === dateStr && !consumedConcreteIds.has(s.id))
        .map((s) => {
          const allClaims = pendingClaims.filter((c) => c.shiftId === s.id)
          const acceptedClaims = allClaims.filter((c) => c.status === "approved")
          const myClaim = allClaims.find((c) => c.claimedByUserId === session.user.id)
          return {
            id: s.id,
            startTime: shortTime(s.startTime),
            endTime: shortTime(s.endTime),
            note: s.note,
            maxClaims: s.maxClaims,
            acceptedCount: acceptedClaims.length,
            claimedByUsers: acceptedClaims.map((c) => {
              const emp = colorMap.get(c.claimedByUserId)
              return { userId: c.claimedByUserId, userName: emp?.name ?? "—", color: emp?.color ?? "#6b7280", claimId: c.id }
            }),
            myClaimId: myClaim?.id ?? null,
            iMayClaim: !myClaim,
          }
        })

      const dayOpenShifts = [...legacyOpenShifts, ...ruleOpenShifts]

      const dayRequestedShifts: RequestedShift[] = requestedShifts
        .filter((s) => s.date === dateStr)
        .map((s) => ({
          id: s.id,
          startTime: shortTime(s.startTime),
          endTime: shortTime(s.endTime),
          note: s.note,
        }))

      return {
        date: dateStr,
        isCurrentMonth: date.getMonth() === monthNum - 1,
        isToday: dateStr === todayStr,
        shifts: dayShifts,
        openShifts: dayOpenShifts,
        requestedShifts: dayRequestedShifts,
      }
    }),
  )

  const prevMonth =
    monthNum === 1
      ? `${year - 1}-12`
      : `${year}-${String(monthNum - 1).padStart(2, "0")}`
  const nextMonth =
    monthNum === 12
      ? `${year + 1}-01`
      : `${year}-${String(monthNum + 1).padStart(2, "0")}`

  return (
    <MonthCalendar
      weeks={calendarWeeks}
      monthLabel={formatMonthLabel(year, monthNum)}
      prevMonth={prevMonth}
      nextMonth={nextMonth}
      allEmployees={employees.map((e) => ({ id: e.id, name: e.name }))}
      businessHours={bhMap}
      currentUserId={session.user.id}
      canCreateShifts={isAdmin}
    />
  )
}

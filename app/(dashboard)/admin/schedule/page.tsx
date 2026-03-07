export const dynamic = "force-dynamic"

import { db } from "@/db"
import { shifts, user, businessHours, openShiftClaims, shiftRules, shiftExceptions } from "@/db/schema"
import { eq, and, gte, lte, asc, or } from "drizzle-orm"
import { requireAdmin } from "@/lib/auth-guard"
import { AdminMonthCalendar, type AdminCalendarDay, type AdminCalendarShift, type AdminOpenShift, type AdminRequestedShift } from "@/components/schedule/admin-month-calendar"
import { RequestedRulesPanel, type RequestedRuleRow } from "@/components/schedule/requested-rules-panel"
import { getMonthGrid, toDateStr, formatMonthLabel, shortTime } from "@/lib/week"
import { expandRules, type ShiftRule, type ShiftException } from "@/lib/expand-rules"

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const session = await requireAdmin()
  const orgId = (session.user as { organizationId?: string | null }).organizationId!

  const { month } = await searchParams
  const { year, monthNum, weeks } = getMonthGrid(month)

  const startDate = toDateStr(weeks[0][0])
  const endDate = toDateStr(weeks[weeks.length - 1][6])
  const todayStr = toDateStr(new Date())

  const [monthShifts, requestedShifts, pendingClaims, employees, orgBusinessHours, rules, exceptions, requestedRulesRaw] = await Promise.all([
    db
      .select({
        id: shifts.id,
        userId: shifts.userId,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        note: shifts.note,
        status: shifts.status,
      })
      .from(shifts)
      .where(and(eq(shifts.organizationId, orgId), gte(shifts.date, startDate), lte(shifts.date, endDate)))
      .orderBy(asc(shifts.startTime)),

    db
      .select({ id: shifts.id, userId: shifts.userId, date: shifts.date, startTime: shifts.startTime, endTime: shifts.endTime, note: shifts.note })
      .from(shifts)
      .where(and(eq(shifts.organizationId, orgId), eq(shifts.status, "requested"), gte(shifts.date, startDate), lte(shifts.date, endDate)))
      .orderBy(asc(shifts.startTime)),

    db
      .select({
        id: openShiftClaims.id,
        shiftId: openShiftClaims.shiftId,
        claimedByUserId: openShiftClaims.claimedByUserId,
        status: openShiftClaims.status,
      })
      .from(openShiftClaims)
      .where(and(eq(openShiftClaims.organizationId, orgId), eq(openShiftClaims.status, "pending"))),

    db
      .select({
        id: user.id,
        name: user.name,
        color: user.color,
        archivedAt: user.archivedAt,
      })
      .from(user)
      .where(eq(user.organizationId, orgId))
      .orderBy(asc(user.name)),

    db
      .select()
      .from(businessHours)
      .where(eq(businessHours.organizationId, orgId)),

    // Fetch shift rules that could overlap with the visible range
    db
      .select()
      .from(shiftRules)
      .where(
        and(
          eq(shiftRules.organizationId, orgId),
          or(
            // once: date in range
            and(eq(shiftRules.frequency, "once"), gte(shiftRules.date, startDate), lte(shiftRules.date, endDate)),
            // recurring: validFrom <= endDate AND validUntil >= startDate (overlap)
            and(
              or(eq(shiftRules.frequency, "weekly"), eq(shiftRules.frequency, "monthly")),
              lte(shiftRules.validFrom, endDate),
              gte(shiftRules.validUntil, startDate),
            ),
          ),
        ),
      ),

    // Fetch exceptions for all rules in this org (filtered by date range)
    db
      .select()
      .from(shiftExceptions)
      .where(and(gte(shiftExceptions.date, startDate), lte(shiftExceptions.date, endDate))),

    // Requested shift rules (from employees)
    db
      .select({
        id: shiftRules.id,
        userId: shiftRules.userId,
        userName: user.name,
        frequency: shiftRules.frequency,
        days: shiftRules.days,
        date: shiftRules.date,
        validFrom: shiftRules.validFrom,
        validUntil: shiftRules.validUntil,
        startTime: shiftRules.startTime,
        endTime: shiftRules.endTime,
        allDay: shiftRules.allDay,
        note: shiftRules.note,
      })
      .from(shiftRules)
      .leftJoin(user, eq(shiftRules.userId, user.id))
      .where(and(eq(shiftRules.organizationId, orgId), eq(shiftRules.status, "requested"))),
  ])

  const colorMap = new Map(employees.map((e) => [e.id, { name: e.name, color: e.color ?? "#6b7280" }]))
  const bhMap = new Map(orgBusinessHours.map((r) => [r.dayOfWeek, r]))

  // Expand rules into virtual instances
  const ruleData: ShiftRule[] = rules.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    userId: r.userId,
    frequency: r.frequency,
    date: r.date,
    days: r.days,
    dayOfMonth: r.dayOfMonth,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
    startTime: r.startTime,
    endTime: r.endTime,
    allDay: r.allDay,
    note: r.note,
    status: r.status,
  }))

  const exData: ShiftException[] = exceptions.map((e) => ({
    id: e.id,
    ruleId: e.ruleId,
    date: e.date,
    action: e.action,
    userId: e.userId,
    startTime: e.startTime,
    endTime: e.endTime,
    note: e.note,
  }))

  const ruleInstances = expandRules(ruleData, exData, startDate, endDate, bhMap)

  const calendarWeeks: AdminCalendarDay[][] = weeks.map((week) =>
    week.map((date) => {
      const dateStr = toDateStr(date)

      // Concrete shifts (legacy)
      const dayShifts: AdminCalendarShift[] = monthShifts
        .filter((s) => s.date === dateStr && s.status !== "open" && s.status !== "requested")
        .map((s) => {
          const emp = s.userId ? colorMap.get(s.userId) : undefined
          return {
            id: s.id,
            ruleId: null,
            userId: s.userId ?? "",
            userName: emp?.name ?? "—",
            date: dateStr,
            startTime: shortTime(s.startTime),
            endTime: shortTime(s.endTime),
            note: s.note,
            status: s.status,
            color: emp?.color ?? "#6b7280",
            isRule: false,
          }
        })

      // Rule-based instances (exclude open and requested — requested shown in separate panel)
      const ruleShifts: AdminCalendarShift[] = ruleInstances
        .filter((ri) => ri.date === dateStr && ri.status !== "open" && ri.status !== "requested")
        .map((ri) => {
          const emp = ri.userId ? colorMap.get(ri.userId) : undefined
          return {
            id: `rule:${ri.ruleId}:${dateStr}`,
            ruleId: ri.ruleId,
            userId: ri.userId ?? "",
            userName: emp?.name ?? "—",
            date: dateStr,
            startTime: ri.startTime,
            endTime: ri.endTime,
            note: ri.note,
            status: ri.status,
            color: emp?.color ?? "#6b7280",
            isRule: true,
            isRecurring: ri.frequency !== "once",
            exceptionId: ri.exceptionId,
          }
        })

      const dayRequestedShifts: AdminRequestedShift[] = requestedShifts
        .filter((s) => s.date === dateStr)
        .map((s) => {
          const emp = s.userId ? colorMap.get(s.userId) : undefined
          return {
            id: s.id,
            userId: s.userId ?? "",
            userName: emp?.name ?? "—",
            color: emp?.color ?? "#6b7280",
            date: dateStr,
            startTime: shortTime(s.startTime),
            endTime: shortTime(s.endTime),
            note: s.note,
          }
        })

      const dayOpenShifts: AdminOpenShift[] = [
        // Legacy open shifts
        ...monthShifts
          .filter((s) => s.date === dateStr && s.status === "open")
          .map((s) => {
            const claimsForShift = pendingClaims.filter((c) => c.shiftId === s.id)
            return {
              id: s.id,
              date: dateStr,
              startTime: shortTime(s.startTime),
              endTime: shortTime(s.endTime),
              note: s.note,
              isRule: false,
              ruleId: null,
              claims: claimsForShift.map((c) => {
                const emp = colorMap.get(c.claimedByUserId)
                return { claimId: c.id, userId: c.claimedByUserId, userName: emp?.name ?? "—", color: emp?.color ?? "#6b7280" }
              }),
            }
          }),
        // Rule-based open shifts
        ...ruleInstances
          .filter((ri) => ri.date === dateStr && ri.status === "open")
          .map((ri) => ({
            id: `rule:${ri.ruleId}:${dateStr}`,
            date: dateStr,
            startTime: ri.startTime,
            endTime: ri.endTime,
            note: ri.note,
            isRule: true,
            ruleId: ri.ruleId,
            claims: [] as { claimId: string; userId: string; userName: string; color: string }[],
          })),
      ]

      return {
        date: dateStr,
        isCurrentMonth: date.getMonth() === monthNum - 1,
        isToday: dateStr === todayStr,
        shifts: [...dayShifts, ...ruleShifts],
        openShifts: dayOpenShifts,
        requestedShifts: dayRequestedShifts,
      }
    }),
  )

  const prevMonth =
    monthNum === 1 ? `${year - 1}-12` : `${year}-${String(monthNum - 1).padStart(2, "0")}`
  const nextMonth =
    monthNum === 12 ? `${year + 1}-01` : `${year}-${String(monthNum + 1).padStart(2, "0")}`

  const activeEmployees = employees.filter((e) => !e.archivedAt)
  const employeeOptions = activeEmployees.map((e) => ({ id: e.id, name: e.name }))

  const requestedRules: RequestedRuleRow[] = (requestedRulesRaw as typeof requestedRulesRaw).map((r) => ({
    id: r.id,
    userName: r.userName ?? null,
    frequency: r.frequency,
    days: r.days,
    date: r.date,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
    startTime: r.startTime,
    endTime: r.endTime,
    allDay: r.allDay,
    note: r.note,
  }))

  return (
    <div className="flex flex-col gap-6 w-full">
      <RequestedRulesPanel rows={requestedRules} />
      <AdminMonthCalendar
        weeks={calendarWeeks}
        employees={employeeOptions}
        monthLabel={formatMonthLabel(year, monthNum)}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        businessHours={bhMap}
      />
    </div>
  )
}

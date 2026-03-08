export const dynamic = "force-dynamic"

import { db } from "@/db"
import { shifts, user, businessHours, openShiftClaims, leaves } from "@/db/schema"
import { eq, and, gte, lte, asc, or } from "drizzle-orm"
import { requireAdmin } from "@/lib/auth-guard"
import { AdminMonthCalendar, type AdminCalendarDay, type AdminCalendarShift, type AdminOpenShift, type AdminCalendarLeave } from "@/components/schedule/admin-month-calendar"
import { getMonthGrid, toDateStr, formatMonthLabel, shortTime } from "@/lib/week"

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; week?: string; date?: string }>
}) {
  const session = await requireAdmin()
  const orgId = (session.user as { organizationId?: string | null }).organizationId!

  const { month, week, date } = await searchParams
  const initialWeek = week === "last" ? "last" : week === "first" ? "first" : undefined
  const initialDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
  const { year, monthNum, weeks } = getMonthGrid(month)

  const startDate = toDateStr(weeks[0][0])
  const endDate = toDateStr(weeks[weeks.length - 1][6])
  const todayStr = toDateStr(new Date())

  const [monthShifts, claims, employees, orgBusinessHours, allLeaves] = await Promise.all([
    // All shifts in date range (draft, open, published)
    db
      .select({
        id: shifts.id,
        userId: shifts.userId,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        note: shifts.note,
        status: shifts.status,
        maxClaims: shifts.maxClaims,
      })
      .from(shifts)
      .where(and(eq(shifts.organizationId, orgId), gte(shifts.date, startDate), lte(shifts.date, endDate)))
      .orderBy(asc(shifts.startTime)),

    // Approved claims for open shifts
    db
      .select({
        id: openShiftClaims.id,
        shiftId: openShiftClaims.shiftId,
        claimedByUserId: openShiftClaims.claimedByUserId,
        status: openShiftClaims.status,
      })
      .from(openShiftClaims)
      .where(and(eq(openShiftClaims.organizationId, orgId), eq(openShiftClaims.status, "approved"))),

    // Employees
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

    // Business hours (for calendar display)
    db
      .select()
      .from(businessHours)
      .where(eq(businessHours.organizationId, orgId)),

    // Approved + pending leaves
    db
      .select({ userId: leaves.userId, startDate: leaves.startDate, endDate: leaves.endDate, type: leaves.type, status: leaves.status })
      .from(leaves)
      .where(and(eq(leaves.organizationId, orgId), or(eq(leaves.status, "approved"), eq(leaves.status, "pending")), lte(leaves.startDate, endDate), gte(leaves.endDate, startDate))),
  ])

  const colorMap = new Map(employees.map((e) => [e.id, { name: e.name, color: e.color ?? "#6b7280" }]))
  const bhMap = new Map(orgBusinessHours.map((r) => [r.dayOfWeek, r]))

  const calendarWeeks: AdminCalendarDay[][] = weeks.map((week) =>
    week.map((date) => {
      const dateStr = toDateStr(date)

      // Assigned shifts (draft or published with userId)
      const dayShifts: AdminCalendarShift[] = monthShifts
        .filter((s) => s.date === dateStr && (s.status === "draft" || s.status === "published") && s.userId)
        .map((s) => {
          const emp = s.userId ? colorMap.get(s.userId) : undefined
          return {
            id: s.id,
            userId: s.userId ?? "",
            userName: emp?.name ?? "—",
            date: dateStr,
            startTime: shortTime(s.startTime),
            endTime: shortTime(s.endTime),
            note: s.note,
            status: s.status as "draft" | "published",
            color: emp?.color ?? "#6b7280",
          }
        })

      // Open shifts (draft aj open) s claims
      const dayOpenShifts: AdminOpenShift[] = monthShifts
        .filter((s) => s.date === dateStr && !s.userId && (s.status === "draft" || s.status === "open"))
        .map((s) => {
          const shiftClaims = claims.filter((c) => c.shiftId === s.id)
          return {
            id: s.id,
            date: dateStr,
            startTime: shortTime(s.startTime),
            endTime: shortTime(s.endTime),
            note: s.note,
            maxClaims: s.maxClaims,
            status: s.status as "draft" | "open",
            claims: shiftClaims.map((c) => {
              const emp = colorMap.get(c.claimedByUserId)
              return { claimId: c.id, userId: c.claimedByUserId, userName: emp?.name ?? "—", color: emp?.color ?? "#6b7280" }
            }),
          }
        })

      const dayLeaves: AdminCalendarLeave[] = allLeaves
        .filter((l) => l.startDate <= dateStr && l.endDate >= dateStr)
        .map((l) => {
          const emp = colorMap.get(l.userId)
          return {
            userId: l.userId,
            userName: emp?.name ?? "—",
            color: emp?.color ?? "#6b7280",
            type: l.type,
            status: l.status as "approved" | "pending",
            startDate: l.startDate,
            endDate: l.endDate,
          }
        })

      return {
        date: dateStr,
        isCurrentMonth: date.getMonth() === monthNum - 1,
        isToday: dateStr === todayStr,
        shifts: dayShifts,
        openShifts: dayOpenShifts,
        leaves: dayLeaves,
      }
    }),
  )

  const prevMonth =
    monthNum === 1 ? `${year - 1}-12` : `${year}-${String(monthNum - 1).padStart(2, "0")}`
  const nextMonth =
    monthNum === 12 ? `${year + 1}-01` : `${year}-${String(monthNum + 1).padStart(2, "0")}`

  const activeEmployees = employees.filter((e) => !e.archivedAt)
  const employeeOptions = activeEmployees.map((e) => ({ id: e.id, name: e.name }))

  return (
    <AdminMonthCalendar
      weeks={calendarWeeks}
      employees={employeeOptions}
      monthLabel={formatMonthLabel(year, monthNum)}
      prevMonth={prevMonth}
      nextMonth={nextMonth}
      initialWeek={initialWeek}
      initialDate={initialDate}
      businessHours={bhMap}
    />
  )
}

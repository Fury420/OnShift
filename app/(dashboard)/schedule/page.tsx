export const dynamic = "force-dynamic"

import { db } from "@/db"
import { shifts, user, leaves, openShiftClaims, businessHours } from "@/db/schema"
import { eq, and, gte, lte, asc, or } from "drizzle-orm"
import { getSession } from "@/lib/session"
import { getOrganizationId } from "@/lib/auth-guard"
import { redirect } from "next/navigation"
import { MonthCalendar, type CalendarDay, type CalendarShift, type OpenShift, type CalendarLeave } from "@/components/schedule/month-calendar"
import { getMonthGrid, toDateStr, formatMonthLabel, shortTime } from "@/lib/week"

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; week?: string; date?: string }>
}) {
  const session = await getSession()
  if (!session) redirect("/login")

  const sessionUser = session.user as { role?: string; organizationId?: string | null }
  const isAdmin = sessionUser.role === "admin"
  const orgId = await getOrganizationId()

  const { month, week, date } = await searchParams
  const initialWeek = week === "last" ? "last" : week === "first" ? "first" : undefined
  const initialDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
  const { year, monthNum, weeks } = getMonthGrid(month)

  const startDate = toDateStr(weeks[0][0])
  const endDate = toDateStr(weeks[weeks.length - 1][6])
  const todayStr = toDateStr(new Date())

  const [monthShifts, openMonthShifts, approvedClaims, employees, approvedLeaves, orgBusinessHours] = await Promise.all([
    // Published shifts (assigned to employees)
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

    // Open shifts
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

    // Approved claims
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
      .select({ id: user.id, name: user.name, color: user.color })
      .from(user)
      .where(eq(user.organizationId, orgId))
      .orderBy(asc(user.name)),

    // Approved + pending leaves
    db
      .select({ userId: leaves.userId, startDate: leaves.startDate, endDate: leaves.endDate, type: leaves.type, status: leaves.status })
      .from(leaves)
      .where(and(eq(leaves.organizationId, orgId), or(eq(leaves.status, "approved"), eq(leaves.status, "pending")), lte(leaves.startDate, endDate), gte(leaves.endDate, startDate))),

    // Otváracie hodiny (pre časové rozmedzie kalendára)
    db
      .select()
      .from(businessHours)
      .where(eq(businessHours.organizationId, orgId)),
  ])

  const onLeave = (userId: string, date: string) =>
    approvedLeaves.some((l) => l.status === "approved" && l.userId === userId && l.startDate <= date && l.endDate >= date)

  const colorMap = new Map(
    employees.map((e) => [e.id, { id: e.id, name: e.name, color: e.color ?? "#6b7280" }]),
  )

  const visibleShifts = monthShifts.filter((s) => !s.userId || !onLeave(s.userId, s.date))

  const calendarWeeks: CalendarDay[][] = weeks.map((week) =>
    week.map((date) => {
      const dateStr = toDateStr(date)

      const dayShifts: CalendarShift[] = visibleShifts
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

      const dayOpenShifts: OpenShift[] = openMonthShifts
        .filter((s) => s.date === dateStr)
        .map((s) => {
          const shiftClaims = approvedClaims.filter((c) => c.shiftId === s.id)
          const myClaim = shiftClaims.find((c) => c.claimedByUserId === session.user.id)
          return {
            id: s.id,
            startTime: shortTime(s.startTime),
            endTime: shortTime(s.endTime),
            note: s.note,
            maxClaims: s.maxClaims,
            acceptedCount: shiftClaims.length,
            claimedByUsers: shiftClaims.map((c) => {
              const emp = colorMap.get(c.claimedByUserId)
              return { userId: c.claimedByUserId, userName: emp?.name ?? "—", color: emp?.color ?? "#6b7280", claimId: c.id }
            }),
            myClaimId: myClaim?.id ?? null,
            iMayClaim: !myClaim && shiftClaims.length < s.maxClaims,
          }
        })

      const dayLeaves: CalendarLeave[] = approvedLeaves
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

  const bhMap = new Map(orgBusinessHours.map((r) => [r.dayOfWeek, r]))

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
      initialWeek={initialWeek}
      initialDate={initialDate}
      allEmployees={employees.map((e) => ({ id: e.id, name: e.name }))}
      businessHours={bhMap}
      currentUserId={session.user.id}
      canCreateShifts={isAdmin}
    />
  )
}

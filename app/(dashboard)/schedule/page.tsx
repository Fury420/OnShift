export const dynamic = "force-dynamic"

import { db } from "@/db"
import { shifts, user, leaves, openShiftClaims, businessHours, positions } from "@/db/schema"
import { eq, and, gte, lte, asc, or, inArray, isNull } from "drizzle-orm"
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

  // Admin sees all shifts (draft + open + published); employee sees only published + open
  const shiftStatusFilter = isAdmin
    ? or(eq(shifts.status, "published"), eq(shifts.status, "open"), eq(shifts.status, "draft"))
    : or(eq(shifts.status, "published"), eq(shifts.status, "open"))

  const [allShifts, allClaims, employees, approvedLeaves, orgBusinessHours, orgPositions] = await Promise.all([
    db
      .select({
        id: shifts.id,
        userId: shifts.userId,
        positionId: shifts.positionId,
        date: shifts.date,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        note: shifts.note,
        status: shifts.status,
        maxClaims: shifts.maxClaims,
      })
      .from(shifts)
      .where(and(eq(shifts.organizationId, orgId), shiftStatusFilter!, gte(shifts.date, startDate), lte(shifts.date, endDate)))
      .orderBy(asc(shifts.startTime)),

    // Admin sees all claims; employee sees only approved
    isAdmin
      ? db
          .select({ id: openShiftClaims.id, shiftId: openShiftClaims.shiftId, claimedByUserId: openShiftClaims.claimedByUserId, status: openShiftClaims.status })
          .from(openShiftClaims)
          .where(and(eq(openShiftClaims.organizationId, orgId), eq(openShiftClaims.status, "approved")))
      : db
          .select({ id: openShiftClaims.id, shiftId: openShiftClaims.shiftId, claimedByUserId: openShiftClaims.claimedByUserId, status: openShiftClaims.status })
          .from(openShiftClaims)
          .where(and(eq(openShiftClaims.organizationId, orgId), eq(openShiftClaims.status, "approved"))),

    db
      .select({ id: user.id, name: user.name, color: user.color, role: user.role, positionId: user.positionId, archivedAt: user.archivedAt })
      .from(user)
      .where(eq(user.organizationId, orgId))
      .orderBy(asc(user.name)),

    db
      .select({ userId: leaves.userId, startDate: leaves.startDate, endDate: leaves.endDate, type: leaves.type, status: leaves.status })
      .from(leaves)
      .where(and(eq(leaves.organizationId, orgId), or(eq(leaves.status, "approved"), eq(leaves.status, "pending")), lte(leaves.startDate, endDate), gte(leaves.endDate, startDate))),

    db.select().from(businessHours).where(eq(businessHours.organizationId, orgId)),

    db.select({ id: positions.id, name: positions.name }).from(positions).where(eq(positions.organizationId, orgId)).orderBy(asc(positions.sortOrder), asc(positions.name)),
  ])

  const onLeave = (userId: string, date: string) =>
    approvedLeaves.some((l) => l.status === "approved" && l.userId === userId && l.startDate <= date && l.endDate >= date)

  const colorMap = new Map(employees.map((e) => [e.id, { id: e.id, name: e.name, color: e.color ?? "#6b7280" }]))
  const posMap = new Map(orgPositions.map((p) => [p.id, p.name]))
  const myPositionId = employees.find((e) => e.id === session.user.id)?.positionId ?? null

  // Split into assigned shifts and open/unassigned shifts
  const assignedShifts = allShifts.filter((s) => s.userId && (s.status === "published" || s.status === "draft"))
  const openShifts = allShifts.filter((s) => !s.userId || s.status === "open")

  // Employee: filter out shifts where user is on leave (admin sees all)
  const visibleAssigned = isAdmin ? assignedShifts : assignedShifts.filter((s) => !s.userId || !onLeave(s.userId, s.date))

  const calendarWeeks: CalendarDay[][] = weeks.map((week) =>
    week.map((dateObj) => {
      const dateStr = toDateStr(dateObj)

      const dayShifts: CalendarShift[] = visibleAssigned
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
            // admin fields
            date: dateStr,
            status: s.status === "draft" ? "draft" as const : "published" as const,
            positionId: s.positionId,
            positionName: s.positionId ? posMap.get(s.positionId) ?? null : null,
          }
        })

      const dayOpenShifts: OpenShift[] = openShifts
        .filter((s) => s.date === dateStr)
        .map((s) => {
          const shiftClaims = allClaims.filter((c) => c.shiftId === s.id)
          const myClaim = shiftClaims.find((c) => c.claimedByUserId === session.user.id)
          const positionMatch = !s.positionId || s.positionId === myPositionId
          return {
            id: s.id,
            positionId: s.positionId,
            positionName: s.positionId ? posMap.get(s.positionId) ?? null : null,
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
            iMayClaim: !myClaim && shiftClaims.length < s.maxClaims && positionMatch,
            // admin fields
            date: dateStr,
            status: s.status === "draft" ? "draft" as const : "open" as const,
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
        isCurrentMonth: dateObj.getMonth() === monthNum - 1,
        isToday: dateStr === todayStr,
        shifts: dayShifts,
        openShifts: dayOpenShifts,
        leaves: dayLeaves,
      }
    }),
  )

  const bhMap = new Map(orgBusinessHours.map((r) => [r.dayOfWeek, r]))

  const prevMonth = monthNum === 1 ? `${year - 1}-12` : `${year}-${String(monthNum - 1).padStart(2, "0")}`
  const nextMonth = monthNum === 12 ? `${year + 1}-01` : `${year}-${String(monthNum + 1).padStart(2, "0")}`

  // For employee: pass only non-admin, non-archived colleagues
  // For admin: pass all employees (including archived for ShiftDialog)
  const calendarEmployees = isAdmin
    ? employees.map((e) => ({ id: e.id, name: e.name, positionId: e.positionId }))
    : employees.filter((e) => e.role !== "admin" && !e.archivedAt).map((e) => ({ id: e.id, name: e.name }))

  return (
    <MonthCalendar
      weeks={calendarWeeks}
      monthLabel={formatMonthLabel(year, monthNum)}
      prevMonth={prevMonth}
      nextMonth={nextMonth}
      initialWeek={initialWeek}
      initialDate={initialDate}
      allEmployees={calendarEmployees}
      businessHours={bhMap}
      currentUserId={session.user.id}
      isAdmin={isAdmin}
      positions={orgPositions}
    />
  )
}

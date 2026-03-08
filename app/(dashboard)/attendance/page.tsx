export const dynamic = "force-dynamic"

import { db } from "@/db"
import { attendance, shifts, user } from "@/db/schema"
import { getSession } from "@/lib/session"
import { eq, and, isNull, gte, lt, asc } from "drizzle-orm"
import { ClockCard } from "@/components/attendance/clock-card"
import { AttendanceTable } from "@/components/attendance/attendance-table"

const TZ = "Europe/Bratislava"

function formatTime(date: Date) {
  return date.toLocaleTimeString("sk-SK", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
}

function formatDate(date: Date) {
  return date.toLocaleDateString("sk-SK", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "numeric",
  })
}

function roundTo15(ms: number): number {
  return Math.round(ms / 60000 / 15) * 15
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`
}

function monthBounds(year: number, month: number) {
  // Use 3h buffer to account for Europe/Bratislava offset (UTC+1/+2)
  const start = new Date(Date.UTC(year, month - 1, 1) - 3 * 3_600_000)
  const end = new Date(Date.UTC(year, month, 1) + 3 * 3_600_000)
  return { start, end }
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  const session = await getSession()
  if (!session) return null

  const now = new Date()
  let year: number, monthNum: number

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    ;[year, monthNum] = month.split("-").map(Number)
  } else {
    year = now.getFullYear()
    monthNum = now.getMonth() + 1
  }

  const { start, end } = monthBounds(year, monthNum)

  const todayStr = now.toLocaleDateString("en-CA", { timeZone: TZ }) // YYYY-MM-DD
  console.log("[attendance] todayStr:", todayStr, "userId:", session.user.id)

  const [openRecord, records, todayShifts, upcomingShiftsRaw, currentUser] = await Promise.all([
    db
      .select()
      .from(attendance)
      .where(and(eq(attendance.userId, session.user.id), isNull(attendance.clockOut)))
      .limit(1)
      .then((r) => r[0] ?? null),

    db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.userId, session.user.id),
          gte(attendance.clockIn, start),
          lt(attendance.clockIn, end),
        ),
      )
      .orderBy(attendance.clockIn),

    db
      .select({ startTime: shifts.startTime, endTime: shifts.endTime })
      .from(shifts)
      .where(and(eq(shifts.userId, session.user.id), eq(shifts.date, todayStr), eq(shifts.status, "published")))
      .orderBy(shifts.startTime),

    db
      .select({ date: shifts.date, startTime: shifts.startTime, endTime: shifts.endTime })
      .from(shifts)
      .where(
        and(
          eq(shifts.userId, session.user.id),
          eq(shifts.status, "published"),
          gte(shifts.date, todayStr),
        ),
      )
      .orderBy(asc(shifts.date), asc(shifts.startTime))
      .limit(20),

    db
      .select({ hourlyRate: user.hourlyRate })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1)
      .then((r) => r[0] ?? null),
  ])

  // Najbližšia zmena = prvá, ktorej začiatok je v budúcnosti
  const nextShift = upcomingShiftsRaw.find((s) => {
    const startStr = typeof s.startTime === "string" ? s.startTime.slice(0, 5) : "00:00"
    const shiftStart = new Date(s.date + "T" + startStr + ":00")
    return shiftStart > now
  }) ?? null

  const formattedRecords = records.map((r) => {
    const dow = r.clockIn.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" })
    return {
      id: r.id,
      date: formatDate(r.clockIn),
      dateStr: r.clockIn.toLocaleDateString("en-CA", { timeZone: TZ }),
      clockIn: formatTime(r.clockIn),
      clockOut: r.clockOut ? formatTime(r.clockOut) : null,
      duration: r.clockOut ? formatDuration(roundTo15(r.clockOut.getTime() - r.clockIn.getTime())) : null,
      note: r.note ?? null,
      isOpen: !r.clockOut,
      isWeekend: dow === "Sat" || dow === "Sun",
    }
  })

  const totalMinutes = records.reduce((sum, r) => {
    if (!r.clockOut) return sum
    return sum + roundTo15(r.clockOut.getTime() - r.clockIn.getTime())
  }, 0)

  const totalMs = records.reduce((sum, r) => {
    if (!r.clockOut) return sum
    return sum + (r.clockOut.getTime() - r.clockIn.getTime())
  }, 0)

  const hourlyRate = currentUser?.hourlyRate != null ? parseFloat(currentUser.hourlyRate) : null
  const monthlyWage = hourlyRate != null ? (totalMinutes / 60) * hourlyRate : null

  const monthLabel = new Date(year, monthNum - 1).toLocaleDateString("sk-SK", {
    month: "long",
    year: "numeric",
  })

  const pad = (n: number) => String(n).padStart(2, "0")
  const prevDate = new Date(year, monthNum - 2)
  const nextDate = new Date(year, monthNum)
  const prevMonth = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`
  const nextMonth = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}`
  const isCurrentMonth = year === now.getFullYear() && monthNum === now.getMonth() + 1

  const nextShiftLabel = nextShift
    ? (() => {
        const d = new Date(nextShift.date + "T12:00:00")
        const dateLabel = d.toLocaleDateString("sk-SK", { weekday: "short", day: "numeric", month: "numeric" })
        const start = typeof nextShift.startTime === "string" ? nextShift.startTime.slice(0, 5) : "–"
        const end = typeof nextShift.endTime === "string" ? nextShift.endTime.slice(0, 5) : "–"
        return { dateLabel, start, end }
      })()
    : null

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-semibold">Dochádzka</h1>

      <ClockCard
        isActive={!!openRecord}
        clockInTime={openRecord?.clockIn.toISOString() ?? null}
        scheduledShifts={todayShifts}
        nextShift={nextShiftLabel}
      />

      <AttendanceTable
        records={formattedRecords}
        totalDuration={formatDuration(totalMinutes)}
        totalMs={totalMs}
        activeClockInTime={openRecord?.clockIn.toISOString() ?? null}
        monthLabel={monthLabel}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        isCurrentMonth={isCurrentMonth}
        userName={session.user.name}
        monthlyWage={monthlyWage}
        hourlyRate={hourlyRate}
      />
    </div>
  )
}

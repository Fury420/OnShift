export const dynamic = "force-dynamic"

import { db } from "@/db"
import { attendance, shifts, user } from "@/db/schema"
import { eq, and, gte, lt, lte, isNotNull, asc } from "drizzle-orm"
import { requireManagerOrAdmin } from "@/lib/auth-guard"
import { redirect } from "next/navigation"
import { DashboardPage } from "@/components/dashboard-page"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HoursPieChart } from "@/components/reports/hours-pie-chart"
import { AdminAttendanceTable } from "@/components/reports/admin-attendance-table"
import { ReportsTabs } from "@/components/reports/reports-tabs"
import { WagesTable } from "@/components/wages/wages-table"
import { PlannedWagesTable } from "@/components/wages/planned-wages-table"

const TZ = "Europe/Bratislava"

function roundTo15(ms: number): number {
  return Math.round(ms / 60000 / 15) * 15
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("sk-SK", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("sk-SK", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "numeric",
  })
}

function monthBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1) - 3 * 3_600_000)
  const end = new Date(Date.UTC(year, month, 1) + 3 * 3_600_000)
  return { start, end }
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; tab?: string }>
}) {
  const session = await requireManagerOrAdmin()
  const { month, tab } = await searchParams

  const isWagesTab = tab === "wages"
  const isAdmin = (session.user as { role?: string }).role === "admin"

  if (isWagesTab && !isAdmin) redirect("/admin/reports")

  const orgId = (session.user as { organizationId?: string | null }).organizationId!
  const now = new Date()
  let year: number, monthNum: number

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    ;[year, monthNum] = month.split("-").map(Number)
  } else {
    year = now.getFullYear()
    monthNum = now.getMonth() + 1
  }

  const { start, end } = monthBounds(year, monthNum)
  const pad = (n: number) => String(n).padStart(2, "0")
  const monthStr = `${year}-${pad(monthNum)}`
  const prevDate = new Date(year, monthNum - 2)
  const nextDate = new Date(year, monthNum)
  const prevMonth = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`
  const nextMonth = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}`
  const monthLabel = new Date(year, monthNum - 1).toLocaleDateString("sk-SK", {
    month: "long",
    year: "numeric",
  })

  const tabParam = isWagesTab ? "&tab=wages" : ""

  const header = (
    <div className="flex items-end justify-between">
      {isAdmin ? (
        <ReportsTabs currentTab={isWagesTab ? "wages" : ""} month={monthStr} />
      ) : (
        <h1 className="text-2xl font-semibold">Reporty</h1>
      )}
      <div className="flex items-center gap-2 pb-px">
        <Button variant="outline" size="icon" asChild>
          <Link href={`/admin/reports?month=${prevMonth}${tabParam}`}>
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
        <span className="text-sm font-medium min-w-36 text-center capitalize">{monthLabel}</span>
        <Button variant="outline" size="icon" asChild>
          <Link href={`/admin/reports?month=${nextMonth}${tabParam}`}>
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  )

  if (isWagesTab) {
    const pad2 = (n: number) => String(n).padStart(2, "0")
    const firstOfMonth = `${year}-${pad2(monthNum)}-01`
    const lastOfMonth = `${year}-${pad2(monthNum)}-${pad2(new Date(year, monthNum, 0).getDate())}`

    function timeToMinutes(t: string): number {
      const [h, m] = t.split(":").map(Number)
      return h * 60 + m
    }

    const [records, monthShifts] = await Promise.all([
      db
        .select({
          userId: attendance.userId,
          userName: user.name,
          userColor: user.color,
          userHourlyRate: user.hourlyRate,
          clockIn: attendance.clockIn,
          clockOut: attendance.clockOut,
        })
        .from(attendance)
        .leftJoin(user, eq(attendance.userId, user.id))
        .where(
          and(
            eq(attendance.organizationId, orgId),
            isNotNull(attendance.clockOut),
            gte(attendance.clockIn, start),
            lt(attendance.clockIn, end),
          ),
        )
        .orderBy(asc(user.name), asc(attendance.clockIn)),

      db
        .select({
          userId: shifts.userId,
          userName: user.name,
          userColor: user.color,
          userHourlyRate: user.hourlyRate,
          startTime: shifts.startTime,
          endTime: shifts.endTime,
        })
        .from(shifts)
        .leftJoin(user, eq(shifts.userId, user.id))
        .where(
          and(
            eq(shifts.organizationId, orgId),
            eq(shifts.status, "published"),
            gte(shifts.date, firstOfMonth),
            lte(shifts.date, lastOfMonth),
          ),
        )
        .orderBy(asc(user.name)),
    ])

    const wagesMap = new Map<string, { name: string; color: string | null; hourlyRate: number | null; totalMinutes: number }>()
    for (const r of records) {
      if (!r.clockOut) continue
      const minutes = roundTo15(r.clockOut.getTime() - r.clockIn.getTime())
      const rate = r.userHourlyRate != null ? parseFloat(r.userHourlyRate) : null
      if (!wagesMap.has(r.userId)) {
        wagesMap.set(r.userId, { name: r.userName ?? "—", color: r.userColor ?? null, hourlyRate: rate, totalMinutes: 0 })
      }
      wagesMap.get(r.userId)!.totalMinutes += minutes
    }

    const plannedMap = new Map<string, { name: string; color: string | null; hourlyRate: number | null; totalMinutes: number }>()
    for (const s of monthShifts) {
      if (!s.userId || !s.startTime || !s.endTime) continue
      const minutes = timeToMinutes(s.endTime) - timeToMinutes(s.startTime)
      if (minutes <= 0) continue
      const rate = s.userHourlyRate != null ? parseFloat(s.userHourlyRate) : null
      if (!plannedMap.has(s.userId)) {
        plannedMap.set(s.userId, { name: s.userName ?? "—", color: s.userColor ?? null, hourlyRate: rate, totalMinutes: 0 })
      }
      plannedMap.get(s.userId)!.totalMinutes += minutes
    }

    const rows = Array.from(wagesMap.entries()).map(([userId, v]) => ({ userId, ...v }))
    const plannedRows = Array.from(plannedMap.entries()).map(([userId, v]) => ({ userId, ...v }))

    return (
      <DashboardPage>
        {header}
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-muted-foreground">Skutočné mzdy</h2>
          <WagesTable rows={rows} />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-muted-foreground">Plánované mzdy (odhad)</h2>
          <PlannedWagesTable rows={plannedRows} />
        </div>
      </DashboardPage>
    )
  }

  // ── Dochádzka tab ────────────────────────────────────────────────────────
  const records = await db
    .select({
      id: attendance.id,
      userId: attendance.userId,
      userName: user.name,
      userColor: user.color,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      note: attendance.note,
    })
    .from(attendance)
    .leftJoin(user, eq(attendance.userId, user.id))
    .where(
      and(
        eq(attendance.organizationId, orgId),
        isNotNull(attendance.clockOut),
        gte(attendance.clockIn, start),
        lt(attendance.clockIn, end),
      ),
    )
    .orderBy(asc(attendance.clockIn), asc(user.name))

  type FlatRow = { id: string; name: string; color: string | null; date: string; clockIn: string; clockOut: string; clockInISO: string; clockOutISO: string; minutes: number; note: string | null }
  const allRows: FlatRow[] = []
  const pieMap = new Map<string, { name: string; color: string | null; totalMinutes: number }>()

  for (const r of records) {
    if (!r.clockOut) continue
    const minutes = roundTo15(r.clockOut.getTime() - r.clockIn.getTime())

    allRows.push({
      id: r.id,
      name: r.userName ?? "—",
      color: r.userColor ?? null,
      date: formatDate(r.clockIn),
      clockIn: formatTime(r.clockIn),
      clockOut: formatTime(r.clockOut),
      clockInISO: r.clockIn.toISOString(),
      clockOutISO: r.clockOut.toISOString(),
      minutes,
      note: r.note ?? null,
    })

    if (!pieMap.has(r.userId)) {
      pieMap.set(r.userId, { name: r.userName ?? "—", color: r.userColor ?? null, totalMinutes: 0 })
    }
    pieMap.get(r.userId)!.totalMinutes += minutes
  }

  const grandTotal = allRows.reduce((s, r) => s + r.minutes, 0)

  return (
    <DashboardPage size="wide">
      {header}
      {allRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Žiadne záznamy za tento mesiac.</p>
      ) : (
        <div className="grid grid-cols-2 items-start gap-6">
          <AdminAttendanceTable rows={allRows} grandTotal={grandTotal} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Odpracované hodiny</CardTitle>
            </CardHeader>
            <CardContent>
              <HoursPieChart
                data={Array.from(pieMap.values()).map((g) => ({
                  name: g.name,
                  minutes: g.totalMinutes,
                  color: g.color,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardPage>
  )
}

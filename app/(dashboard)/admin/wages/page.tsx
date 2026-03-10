export const dynamic = "force-dynamic"

import { db } from "@/db"
import { attendance, shifts, user } from "@/db/schema"
import { eq, and, gte, lt, lte, isNotNull, asc } from "drizzle-orm"
import { requireAdmin } from "@/lib/auth-guard"
import { DashboardPage } from "@/components/dashboard-page"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WagesTable } from "@/components/wages/wages-table"
import { PlannedWagesTable } from "@/components/wages/planned-wages-table"
import { StaffTabs } from "@/components/admin/staff-tabs"

const TZ = "Europe/Bratislava"

function roundTo15(ms: number): number {
  return Math.round(ms / 60000 / 15) * 15
}

function monthBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1) - 3 * 3_600_000)
  const end = new Date(Date.UTC(year, month, 1) + 3 * 3_600_000)
  return { start, end }
}

export default async function AdminWagesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const session = await requireAdmin()
  const orgId = (session.user as { organizationId?: string | null }).organizationId!

  const { month } = await searchParams
  const now = new Date()
  let year: number, monthNum: number

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    ;[year, monthNum] = month.split("-").map(Number)
  } else {
    year = now.getFullYear()
    monthNum = now.getMonth() + 1
  }

  const { start, end } = monthBounds(year, monthNum)

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
      wagesMap.set(r.userId, {
        name: r.userName ?? "—",
        color: r.userColor ?? null,
        hourlyRate: rate,
        totalMinutes: 0,
      })
    }
    wagesMap.get(r.userId)!.totalMinutes += minutes
  }

  const rows = Array.from(wagesMap.entries()).map(([userId, v]) => ({ userId, ...v }))

  const plannedMap = new Map<string, { name: string; color: string | null; hourlyRate: number | null; totalMinutes: number }>()

  for (const s of monthShifts) {
    if (!s.userId || !s.startTime || !s.endTime) continue
    const minutes = timeToMinutes(s.endTime) - timeToMinutes(s.startTime)
    if (minutes <= 0) continue
    const rate = s.userHourlyRate != null ? parseFloat(s.userHourlyRate) : null

    if (!plannedMap.has(s.userId)) {
      plannedMap.set(s.userId, {
        name: s.userName ?? "—",
        color: s.userColor ?? null,
        hourlyRate: rate,
        totalMinutes: 0,
      })
    }
    plannedMap.get(s.userId)!.totalMinutes += minutes
  }

  const plannedRows = Array.from(plannedMap.entries()).map(([userId, v]) => ({ userId, ...v }))

  const pad = (n: number) => String(n).padStart(2, "0")
  const prevDate = new Date(year, monthNum - 2)
  const nextDate = new Date(year, monthNum)
  const prevMonth = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`
  const nextMonth = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}`
  const monthLabel = new Date(year, monthNum - 1).toLocaleDateString("sk-SK", {
    month: "long",
    year: "numeric",
  })

  return (
    <DashboardPage>
      <div className="flex items-end justify-between">
        <StaffTabs />
        <div className="flex items-center gap-2 pb-px">
          <Button variant="outline" size="icon" asChild>
            <Link href={`/admin/wages?month=${prevMonth}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <span className="text-sm font-medium min-w-36 text-center capitalize">{monthLabel}</span>
          <Button variant="outline" size="icon" asChild>
            <Link href={`/admin/wages?month=${nextMonth}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

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

export const dynamic = "force-dynamic"

import { db } from "@/db"
import { shiftReplacements, shifts, user } from "@/db/schema"
import { requireAdmin } from "@/lib/auth-guard"
import { DashboardPage } from "@/components/dashboard-page"
import { eq, and } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { AdminReplacementsTable } from "@/components/shift-replacement/admin-replacements-table"
import { shortTime } from "@/lib/week"

function formatShiftDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("sk-SK", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  })
}

export default async function AdminZastupPage() {
  const session = await requireAdmin()
  const orgId = (session.user as { organizationId?: string | null }).organizationId!

  const requester = alias(user, "requester")
  const replacement = alias(user, "replacement")

  const rows = await db
    .select({
      id: shiftReplacements.id,
      shiftDate: shifts.date,
      shiftStart: shifts.startTime,
      shiftEnd: shifts.endTime,
      requesterName: requester.name,
      replacementName: replacement.name,
      status: shiftReplacements.status,
      note: shiftReplacements.note,
      createdAt: shiftReplacements.createdAt,
    })
    .from(shiftReplacements)
    .innerJoin(shifts, eq(shiftReplacements.shiftId, shifts.id))
    .innerJoin(requester, eq(shiftReplacements.requestedByUserId, requester.id))
    .innerJoin(replacement, eq(shiftReplacements.replacementUserId, replacement.id))
    .where(eq(shiftReplacements.organizationId, orgId))
    .orderBy(shiftReplacements.createdAt)

  const formatted = rows.map((r) => ({
    id: r.id,
    shiftDate: formatShiftDate(r.shiftDate),
    shiftTime: `${shortTime(r.shiftStart)}–${shortTime(r.shiftEnd)}`,
    requesterName: r.requesterName,
    replacementName: r.replacementName,
    status: r.status as "pending" | "accepted" | "rejected",
    note: r.note,
    createdAt: new Date(r.createdAt).toLocaleDateString("sk-SK", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }),
  }))

  return (
    <DashboardPage size="wide">
      <h1 className="text-2xl font-semibold">Žiadosti o zastup</h1>
      <AdminReplacementsTable requests={formatted} />
    </DashboardPage>
  )
}

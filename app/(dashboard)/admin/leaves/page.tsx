export const dynamic = "force-dynamic"

import { db } from "@/db"
import { leaves, user } from "@/db/schema"
import { eq, asc, desc, sql } from "drizzle-orm"
import { requireAdmin } from "@/lib/auth-guard"
import { DashboardPage } from "@/components/dashboard-page"
import { AdminLeavesTable, type AdminLeaveRow } from "@/components/leaves/admin-leaves-table"
import { StaffTabs } from "@/components/admin/staff-tabs"

export default async function AdminLeavesPage() {
  const session = await requireAdmin()
  const orgId = (session.user as { organizationId?: string | null }).organizationId!

  const records = await db
    .select({
      id: leaves.id,
      userName: user.name,
      type: leaves.type,
      startDate: leaves.startDate,
      endDate: leaves.endDate,
      status: leaves.status,
      note: leaves.note,
      createdAt: leaves.createdAt,
    })
    .from(leaves)
    .leftJoin(user, eq(leaves.userId, user.id))
    .where(eq(leaves.organizationId, orgId))
    .orderBy(
      // pending first, then by creation date desc
      sql`CASE WHEN ${leaves.status} = 'pending' THEN 0 ELSE 1 END`,
      desc(leaves.createdAt),
    )

  const rows: AdminLeaveRow[] = records.map((r) => ({
    id: r.id,
    userName: r.userName ?? "—",
    type: r.type,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    note: r.note ?? null,
  }))

  return (
    <DashboardPage>
      <StaffTabs />
      <AdminLeavesTable rows={rows} />
    </DashboardPage>
  )
}

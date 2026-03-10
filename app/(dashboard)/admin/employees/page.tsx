export const dynamic = "force-dynamic"

import { db } from "@/db"
import { user, positions } from "@/db/schema"
import { asc, eq } from "drizzle-orm"
import { requireAdmin } from "@/lib/auth-guard"
import { DashboardPage } from "@/components/dashboard-page"
import { EmployeesTable } from "@/components/employees/employees-table"

export default async function AdminEmployeesPage() {
  const session = await requireAdmin()
  const orgId = (session.user as { organizationId?: string | null }).organizationId!

  const [employees, orgPositions] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        color: user.color,
        hourlyRate: user.hourlyRate,
        positionId: user.positionId,
        archivedAt: user.archivedAt,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.organizationId, orgId))
      .orderBy(asc(user.createdAt)),

    db
      .select({ id: positions.id, name: positions.name })
      .from(positions)
      .where(eq(positions.organizationId, orgId))
      .orderBy(asc(positions.sortOrder), asc(positions.name)),
  ])

  const posMap = new Map(orgPositions.map((p) => [p.id, p.name]))

  const formatted = employees.map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    role: e.role,
    color: e.color ?? "",
    hourlyRate: e.hourlyRate != null ? parseFloat(e.hourlyRate) : null,
    positionId: e.positionId,
    positionName: e.positionId ? posMap.get(e.positionId) ?? null : null,
    isArchived: e.archivedAt !== null,
    createdAt: new Date(e.createdAt).toLocaleDateString("sk-SK", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }),
  }))

  return (
    <DashboardPage>
      <EmployeesTable
        employees={formatted}
        currentUserId={session.user.id}
        positions={orgPositions}
      />
    </DashboardPage>
  )
}

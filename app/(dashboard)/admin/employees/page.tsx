export const dynamic = "force-dynamic"

import { db } from "@/db"
import { user, positions, wageRates } from "@/db/schema"
import { asc, desc, eq } from "drizzle-orm"
import { requireAdmin } from "@/lib/auth-guard"
import { localDateStr } from "@/lib/wages"
import { DashboardPage } from "@/components/dashboard-page"
import { EmployeesTable } from "@/components/employees/employees-table"

export default async function AdminEmployeesPage() {
  const session = await requireAdmin()
  const orgId = (session.user as { organizationId?: string | null }).organizationId!

  const [employees, orgPositions, rates] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        color: user.color,
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

    db
      .select({
        id: wageRates.id,
        userId: wageRates.userId,
        hourlyRate: wageRates.hourlyRate,
        effectiveFrom: wageRates.effectiveFrom,
      })
      .from(wageRates)
      .where(eq(wageRates.organizationId, orgId))
      .orderBy(asc(wageRates.userId), desc(wageRates.effectiveFrom)),
  ])

  const posMap = new Map(orgPositions.map((p) => [p.id, p.name]))

  // História sadzieb podľa usera (zostupne). Dnes platná sadzba = prvý záznam s effectiveFrom <= dnes.
  const today = localDateStr(new Date())
  const historyMap = new Map<string, { id: string; hourlyRate: number; effectiveFrom: string }[]>()
  for (const r of rates) {
    const list = historyMap.get(r.userId) ?? []
    list.push({ id: r.id, hourlyRate: parseFloat(r.hourlyRate), effectiveFrom: r.effectiveFrom })
    historyMap.set(r.userId, list)
  }

  const formatted = employees.map((e) => {
    const wageHistory = historyMap.get(e.id) ?? []
    const currentRate = wageHistory.find((w) => w.effectiveFrom <= today)?.hourlyRate ?? null
    return {
      id: e.id,
      name: e.name,
      email: e.email,
      role: e.role,
      color: e.color ?? "",
      hourlyRate: currentRate,
      wageHistory,
      positionId: e.positionId,
      positionName: e.positionId ? posMap.get(e.positionId) ?? null : null,
      isArchived: e.archivedAt !== null,
      createdAt: new Date(e.createdAt).toLocaleDateString("sk-SK", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
      }),
    }
  })

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

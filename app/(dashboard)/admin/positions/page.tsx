export const dynamic = "force-dynamic"

import { db } from "@/db"
import { positions } from "@/db/schema"
import { asc, eq } from "drizzle-orm"
import { requireAdmin } from "@/lib/auth-guard"
import { PositionsManager } from "@/components/admin/positions-manager"

export default async function AdminPositionsPage() {
  const session = await requireAdmin()
  const orgId = (session.user as { organizationId?: string | null }).organizationId!

  const orgPositions = await db
    .select()
    .from(positions)
    .where(eq(positions.organizationId, orgId))
    .orderBy(asc(positions.sortOrder), asc(positions.name))

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <PositionsManager
        positions={orgPositions.map((p) => ({
          id: p.id,
          name: p.name,
        }))}
      />
    </div>
  )
}

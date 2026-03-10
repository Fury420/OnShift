export const dynamic = "force-dynamic"

import { db } from "@/db"
import { organizations, user } from "@/db/schema"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { eq, count, isNotNull } from "drizzle-orm"
import { OrgsTable } from "./_components/orgs-table"
import { CreateOrgDialog } from "./_components/create-org-dialog"

export default async function SuperadminPage() {
  await requireSuperAdmin()

  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      ico: organizations.ico,
      dic: organizations.dic,
      icDph: organizations.icDph,
      address: organizations.address,
      phone: organizations.phone,
      email: organizations.email,
      licenseType: organizations.licenseType,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .orderBy(organizations.name)

  const userCounts = await db
    .select({ organizationId: user.organizationId, count: count() })
    .from(user)
    .where(isNotNull(user.organizationId))
    .groupBy(user.organizationId)

  const countMap = new Map(userCounts.map((r) => [r.organizationId, r.count]))

  const rows = orgs.map((o) => ({
    id: o.id,
    name: o.name,
    ico: o.ico,
    dic: o.dic,
    icDph: o.icDph,
    address: o.address,
    phone: o.phone,
    email: o.email,
    licenseType: o.licenseType,
    userCount: countMap.get(o.id) ?? 0,
    createdAt: new Date(o.createdAt).toLocaleDateString("sk-SK", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }),
  }))

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Organizácie</h1>
        <CreateOrgDialog />
      </div>
      <OrgsTable rows={rows} />
    </div>
  )
}

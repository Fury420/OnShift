export const dynamic = "force-dynamic"

import { db } from "@/db"
import { organizations } from "@/db/schema"
import { eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import { requireAdmin, getOrganizationId } from "@/lib/auth-guard"
import { OrganizationForm } from "@/components/settings/organization-form"

export default async function AdminSettingsPage() {
  await requireAdmin()
  const orgId = await getOrganizationId()

  const [org] = await db
    .select({
      name: organizations.name,
      ico: organizations.ico,
      dic: organizations.dic,
      icDph: organizations.icDph,
      address: organizations.address,
      phone: organizations.phone,
      email: organizations.email,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)

  if (!org) notFound()

  return <OrganizationForm org={org} />
}

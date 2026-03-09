export const dynamic = "force-dynamic"

import { db } from "@/db"
import { businessHours, organizations } from "@/db/schema"
import { eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import { requireAdmin, getOrganizationId } from "@/lib/auth-guard"
import { BusinessHoursForm } from "@/components/settings/business-hours-form"
import { OrganizationForm } from "@/components/settings/organization-form"
import { Separator } from "@/components/ui/separator"

const DAYS = [
  { value: "1", label: "Pondelok" },
  { value: "2", label: "Utorok" },
  { value: "3", label: "Streda" },
  { value: "4", label: "Štvrtok" },
  { value: "5", label: "Piatok" },
  { value: "6", label: "Sobota" },
  { value: "0", label: "Nedeľa" },
]

export default async function AdminSettingsPage() {
  await requireAdmin()
  const orgId = await getOrganizationId()

  const [orgRows, hoursRows] = await Promise.all([
    db
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
      .limit(1),
    db
      .select()
      .from(businessHours)
      .where(eq(businessHours.organizationId, orgId)),
  ])

  const org = orgRows[0]
  if (!org) notFound()
  const hoursMap = new Map(hoursRows.map((r) => [r.dayOfWeek, r]))

  const initialData = DAYS.map((d) => {
    const row = hoursMap.get(d.value)
    return {
      dayOfWeek: d.value,
      label: d.label,
      isClosed: row?.isClosed ?? true,
      openTime: row?.openTime?.slice(0, 5) ?? "15:00",
      closeTime: row?.closeTime?.slice(0, 5) ?? "23:00",
    }
  })

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-semibold">Nastavenia</h1>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Údaje firmy</h2>
          <p className="text-sm text-muted-foreground">Fakturačné a kontaktné údaje</p>
        </div>
        <OrganizationForm org={org} />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Otváracie hodiny</h2>
          <p className="text-sm text-muted-foreground">Otváracie hodiny podniku</p>
        </div>
        <BusinessHoursForm initialData={initialData} />
      </section>
    </div>
  )
}

export const dynamic = "force-dynamic"

import { db } from "@/db"
import { businessHours } from "@/db/schema"
import { eq } from "drizzle-orm"
import { requireAdmin, getOrganizationId } from "@/lib/auth-guard"
import { BusinessHoursForm } from "@/components/settings/business-hours-form"

const DAYS = [
  { value: "1", label: "Pondelok" },
  { value: "2", label: "Utorok" },
  { value: "3", label: "Streda" },
  { value: "4", label: "Štvrtok" },
  { value: "5", label: "Piatok" },
  { value: "6", label: "Sobota" },
  { value: "0", label: "Nedeľa" },
]

export default async function BusinessHoursPage() {
  await requireAdmin()
  const orgId = await getOrganizationId()

  const hoursRows = await db
    .select()
    .from(businessHours)
    .where(eq(businessHours.organizationId, orgId))

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

  return <BusinessHoursForm initialData={initialData} />
}

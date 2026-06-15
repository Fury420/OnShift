import { redirect } from "next/navigation"

export default async function AdminWagesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  const target = month
    ? `/admin/reports?tab=wages&month=${month}`
    : "/admin/reports?tab=wages"
  redirect(target)
}

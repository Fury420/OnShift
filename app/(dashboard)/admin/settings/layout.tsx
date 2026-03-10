import { DashboardPage } from "@/components/dashboard-page"
import { SettingsTabs } from "@/components/admin/settings-tabs"

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardPage size="narrow">
      <h1 className="text-2xl font-semibold">Nastavenia</h1>
      <SettingsTabs />
      {children}
    </DashboardPage>
  )
}

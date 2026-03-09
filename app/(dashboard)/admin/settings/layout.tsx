import { SettingsTabs } from "@/components/admin/settings-tabs"

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-semibold">Nastavenia</h1>
      <SettingsTabs />
      {children}
    </div>
  )
}

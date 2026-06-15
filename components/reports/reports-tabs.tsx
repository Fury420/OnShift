"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"

const TABS = [
  { key: "", label: "Dochádzka" },
  { key: "wages", label: "Mzdy" },
]

export function ReportsTabs({ currentTab, month }: { currentTab: string; month: string }) {
  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => {
        const href = tab.key
          ? `/admin/reports?tab=${tab.key}&month=${month}`
          : `/admin/reports?month=${month}`
        const isActive = currentTab === tab.key
        return (
          <Link
            key={tab.key}
            href={href}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50",
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}

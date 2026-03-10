"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/admin/employees", label: "Zamestnanci" },
  { href: "/admin/wages", label: "Mzdy" },
]

export function StaffTabs() {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            pathname.startsWith(tab.href)
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}

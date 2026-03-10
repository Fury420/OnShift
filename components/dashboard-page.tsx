import { cn } from "@/lib/utils"

const MAX_WIDTH = {
  default: "max-w-4xl",
  wide: "max-w-5xl",
  narrow: "max-w-2xl",
} as const

interface DashboardPageProps {
  children: React.ReactNode
  /** default = 4xl (väčšina stránok), wide = 5xl (reporty, žiadosti o zastup), narrow = 2xl (nastavenia) */
  size?: keyof typeof MAX_WIDTH
  className?: string
}

/** Jednotný wrapper pre obsah stránok dashboardu: max-width, vertikálne medzery a centrovanie. */
export function DashboardPage({ children, size = "default", className }: DashboardPageProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 mx-auto w-full",
        MAX_WIDTH[size],
        className
      )}
    >
      {children}
    </div>
  )
}

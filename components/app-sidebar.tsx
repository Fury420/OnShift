"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTransition } from "react"
import { Clock, Calendar, Users, BarChart3, Banknote, ClipboardList, Building2, ChevronsUpDown, Check, Settings2 } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { switchOrganization } from "@/app/actions/organizations"

const employeeNav = [
  { href: "/attendance", label: "Dochádzka", icon: Clock },
  { href: "/schedule", label: "Kalendár", icon: Calendar },
  { href: "/replacements", label: "Žiadosti", icon: ClipboardList },
]

const adminNav = [
  { href: "/admin/employees", label: "Zamestnanci", icon: Users },
  { href: "/admin/reports", label: "Reporty", icon: BarChart3 },
  { href: "/admin/settings", label: "Nastavenia", icon: Settings2 },
]

const managerNav = [
  { href: "/admin/reports", label: "Reporty", icon: BarChart3 },
]

interface AppSidebarProps {
  user: { name: string; email: string; role: string; color?: string | null }
  orgs: { id: string; name: string }[]
  activeOrgId: string | null
  pendingReplacementCount: number
  pendingLeaveCount?: number
}

const employeesPaths = ["/admin/employees", "/admin/wages", "/admin/leaves"]

export function AppSidebar({ user, orgs, activeOrgId, pendingReplacementCount, pendingLeaveCount = 0 }: AppSidebarProps) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const [isPending, startTransition] = useTransition()

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0] ?? null

  function handleSwitch(orgId: string) {
    startTransition(async () => {
      await switchOrganization(orgId)
    })
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-3 pt-2 pb-0 flex flex-col items-center">
        <Link href="/" onClick={() => setOpenMobile(false)}>
          <Image src="/logo.png" alt="Shiftie" width={160} height={44} className="object-contain" unoptimized />
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-4">
        <SidebarGroup className="px-0 py-2">
          <SidebarMenu className="gap-1">
            {employeeNav.map(({ href, label, icon: Icon }) => {
              const hasBadge =
                (href === "/replacements" && pendingReplacementCount > 0) ||
                (href === "/replacements" && user.role === "manager" && pendingLeaveCount > 0)
              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(href)} size="lg" className="rounded-lg px-3 min-h-12">
                    <Link href={href} onClick={() => setOpenMobile(false)}>
                      <Icon />
                      <span>{label}</span>
                      {hasBadge && (
                        <span className="ml-auto size-2 rounded-full bg-destructive" />
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>

        {(user.role === "admin" || user.role === "manager") && (
          <>
            <SidebarSeparator />
            <SidebarGroup className="px-0 py-2">
              <SidebarGroupLabel>Administrácia</SidebarGroupLabel>
              <SidebarMenu className="gap-1">
                {(user.role === "admin" ? adminNav : managerNav).map(({ href, label, icon: Icon }) => {
                  const isEmployees = href === "/admin/employees"
                  const isActive = isEmployees
                    ? employeesPaths.some((p) => pathname.startsWith(p))
                    : pathname.startsWith(href)
                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton asChild isActive={isActive} size="lg" className="rounded-lg px-3 min-h-12">
                        <Link href={href} onClick={() => setOpenMobile(false)}>
                          <Icon />
                          <span>{label}</span>
                          {isEmployees && pendingLeaveCount > 0 && (
                            <span className="ml-auto size-2 rounded-full bg-destructive" />
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      {activeOrg && (
        <SidebarFooter className="px-4 pb-3 pt-0">
          {orgs.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center justify-center rounded-lg border bg-card p-3 transition-colors hover:bg-accent disabled:opacity-50"
                  disabled={isPending}
                >
                  <div className="flex min-w-0 flex-col items-center text-center">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Aktívna firma</span>
                    <span className="truncate text-sm font-semibold text-foreground max-w-full">{activeOrg.name}</span>
                  </div>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="top" className="w-56">
                {orgs.map((org) => (
                  <DropdownMenuItem
                    key={org.id}
                    onSelect={() => handleSwitch(org.id)}
                    className="flex items-center gap-2"
                  >
                    <Building2 className="size-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{org.name}</span>
                    {org.id === activeOrgId && <Check className="size-4 shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex w-full items-center justify-center rounded-lg border bg-card p-3">
              <div className="flex min-w-0 flex-col items-center text-center">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Aktívna firma</span>
                <span className="truncate text-sm font-semibold text-foreground max-w-full">{activeOrg.name}</span>
              </div>
            </div>
          )}
        </SidebarFooter>
      )}
    </Sidebar>
  )
}

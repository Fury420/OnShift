export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import Link from "next/link"
import { db } from "@/db"
import { organizations, user, attendance, shifts, leaves } from "@/db/schema"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { eq, count, and, isNull } from "drizzle-orm"
import { ArrowLeft, Users, Clock, CalendarCheck, Palmtree } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

export default async function OrgDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  await requireSuperAdmin()
  const { orgId } = await params

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)

  if (!org) notFound()

  const [employees, [{ attendanceCount }], [{ shiftsCount }], [{ leavesCount }]] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        color: user.color,
        archivedAt: user.archivedAt,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.organizationId, orgId))
      .orderBy(user.createdAt),

    db
      .select({ attendanceCount: count() })
      .from(attendance)
      .where(and(eq(attendance.organizationId, orgId), isNull(attendance.clockOut))),

    db
      .select({ shiftsCount: count() })
      .from(shifts)
      .where(eq(shifts.organizationId, orgId)),

    db
      .select({ leavesCount: count() })
      .from(leaves)
      .where(eq(leaves.organizationId, orgId)),
  ])

  const activeEmployees = employees.filter((e) => !e.archivedAt)

  const stats = [
    { label: "Zamestnanci", value: activeEmployees.length, icon: Users },
    { label: "Aktívne clock-in", value: attendanceCount, icon: Clock },
    { label: "Zmeny celkom", value: shiftsCount, icon: CalendarCheck },
    { label: "Dovolenky", value: leavesCount, icon: Palmtree },
  ]

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/superadmin" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{org.name}</h1>
          {(org.ico || org.address) && (
            <p className="text-sm text-muted-foreground">
              {[org.ico && `IČO: ${org.ico}`, org.address].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg border p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Icon className="size-3.5" />
              {label}
            </div>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {/* Org info */}
      {(org.email || org.phone || org.dic) && (
        <div className="rounded-lg border p-4 flex flex-wrap gap-4 text-sm">
          {org.email && <span><span className="text-muted-foreground">Email: </span>{org.email}</span>}
          {org.phone && <span><span className="text-muted-foreground">Tel: </span>{org.phone}</span>}
          {org.dic && <span><span className="text-muted-foreground">DIČ: </span>{org.dic}</span>}
        </div>
      )}

      {/* Employees table */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Zamestnanci ({employees.length})</h2>
        {employees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Žiadni zamestnanci.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Meno</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rola</TableHead>
                <TableHead>Stav</TableHead>
                <TableHead>Vytvorený</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp) => (
                <TableRow key={emp.id} className={emp.archivedAt ? "opacity-50" : ""}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {emp.color && (
                        <span className="size-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: emp.color }} />
                      )}
                      {emp.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{emp.email}</TableCell>
                  <TableCell>
                    <Badge variant={emp.role === "admin" ? "default" : "secondary"}>
                      {emp.role === "admin" ? "Admin" : "Zamestnanec"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {emp.archivedAt ? (
                      <Badge variant="outline" className="text-muted-foreground">Archivovaný</Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-600 border-green-600">Aktívny</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(emp.createdAt).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "numeric" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

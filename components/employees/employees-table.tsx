"use client"

import { useState, useTransition } from "react"
import { MoreHorizontal, Plus, UserCog, Archive, ArchiveRestore, Trash2, Coins } from "lucide-react"
import { StaffTabs } from "@/components/admin/staff-tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { EmployeeDialog, type EmployeeForEdit } from "./employee-dialog"
import { WageDialog, type WageRateItem } from "./wage-dialog"
import { archiveEmployee, unarchiveEmployee, deleteEmployee } from "@/app/actions/employees"

export interface PositionOption {
  id: string
  name: string
}

export interface Employee {
  id: string
  name: string
  email: string
  role: "superadmin" | "admin" | "manager" | "employee"
  color: string
  hourlyRate: number | null // dnes platná sadzba (na zobrazenie v stĺpci Sadzba)
  wageHistory: WageRateItem[]
  positionId: string | null
  positionName: string | null
  isArchived: boolean
  createdAt: string
}

interface EmployeesTableProps {
  employees: Employee[]
  currentUserId: string
  positions: PositionOption[]
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

type DialogType = "archive" | "delete" | null

export function EmployeesTable({ employees, currentUserId, positions }: EmployeesTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EmployeeForEdit | undefined>()
  const [wageTargetId, setWageTargetId] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ emp: Employee; type: DialogType }>({ emp: null!, type: null })
  const [showArchived, setShowArchived] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Cieľ dialógu Mzda čítame priamo z aktuálneho zoznamu → po revalidácii sa história obnoví.
  const wageTarget = wageTargetId ? employees.find((e) => e.id === wageTargetId) ?? null : null

  function openCreate() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function openEdit(emp: Employee) {
    setEditing({ id: emp.id, name: emp.name, role: emp.role, color: emp.color, positionId: emp.positionId })
    setDialogOpen(true)
  }

  function handleConfirm() {
    const { emp, type } = confirmTarget
    if (!emp || !type) return
    startTransition(async () => {
      if (type === "archive") await archiveEmployee(emp.id)
      if (type === "delete") await deleteEmployee(emp.id)
      setConfirmTarget({ emp: null!, type: null })
    })
  }

  function handleUnarchive(id: string) {
    startTransition(() => unarchiveEmployee(id))
  }

  const active = employees.filter((e) => !e.isArchived)
  const archived = employees.filter((e) => e.isArchived)
  const visible = showArchived ? archived : active

  return (
    <>
      <div className="flex items-center justify-between">
        <StaffTabs />
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5 gap-0.5">
            <Button
              variant={!showArchived ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setShowArchived(false)}
            >
              Aktívni {active.length > 0 && <span className="ml-1 opacity-60">{active.length}</span>}
            </Button>
            <Button
              variant={showArchived ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setShowArchived(true)}
            >
              Archivovaní {archived.length > 0 && <span className="ml-1 opacity-60">{archived.length}</span>}
            </Button>
          </div>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Pridať zamestnanca
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Meno</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Pozícia</TableHead>
              <TableHead>Rola</TableHead>
              <TableHead>Sadzba</TableHead>
              <TableHead>Registrovaný</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {showArchived ? "Žiadni archivovaní zamestnanci" : "Žiadni zamestnanci"}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">{initials(emp.name)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">
                        {emp.name}
                        {emp.id === currentUserId && (
                          <span className="ml-2 text-xs text-muted-foreground">(ja)</span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{emp.email}</TableCell>
                  <TableCell className="text-muted-foreground">{emp.positionName ?? "—"}</TableCell>
                  <TableCell>
                    {emp.role === "admin" ? (
                      <Badge variant="default" className="gap-1">
                        <UserCog className="size-3" />
                        Admin
                      </Badge>
                    ) : emp.role === "manager" ? (
                      <Badge variant="outline" className="gap-1">
                        <UserCog className="size-3" />
                        Manažér
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Zamestnanec</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {emp.hourlyRate != null ? `${Number(emp.hourlyRate).toFixed(2).replace(".", ",")} €/h` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{emp.createdAt}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!showArchived ? (
                          <>
                            <DropdownMenuItem onClick={() => openEdit(emp)}>
                              Upraviť
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setWageTargetId(emp.id)}>
                              <Coins className="size-4" />
                              Mzda
                            </DropdownMenuItem>
                            {emp.id !== currentUserId && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setConfirmTarget({ emp, type: "archive" })}
                                >
                                  <Archive className="size-4" />
                                  Archivovať
                                </DropdownMenuItem>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <DropdownMenuItem
                              onClick={() => handleUnarchive(emp.id)}
                              disabled={isPending}
                            >
                              <ArchiveRestore className="size-4" />
                              Obnoviť
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setConfirmTarget({ emp, type: "delete" })}
                            >
                              <Trash2 className="size-4" />
                              Natrvalo vymazať
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EmployeeDialog open={dialogOpen} onOpenChange={setDialogOpen} employee={editing} positions={positions} />

      {wageTarget && (
        <WageDialog
          open={!!wageTargetId}
          onOpenChange={(o) => { if (!o) setWageTargetId(null) }}
          userId={wageTarget.id}
          userName={wageTarget.name}
          history={wageTarget.wageHistory}
        />
      )}

      <AlertDialog
        open={!!confirmTarget.type}
        onOpenChange={(o: boolean) => { if (!o) setConfirmTarget({ emp: null!, type: null }) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget.type === "archive" ? "Archivovať zamestnanca?" : "Natrvalo vymazať zamestnanca?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget.type === "archive" ? (
                <>
                  <strong>{confirmTarget.emp?.name}</strong> bude archivovaný — nebude sa zobrazovať
                  pri plánovaní zmien, ale jeho záznamy a zmeny zostanú zachované.
                  Môžeš ho kedykoľvek obnoviť.
                </>
              ) : (
                <>
                  Naozaj chceš natrvalo vymazať <strong>{confirmTarget.emp?.name}</strong>?
                  Vymažú sa všetky jeho záznamy dochádzky a zmeny. Táto akcia je <strong>nevratná</strong>.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušiť</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={isPending}
              className={confirmTarget.type === "delete"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined}
            >
              {isPending
                ? (confirmTarget.type === "archive" ? "Archivujem…" : "Vymazávam…")
                : (confirmTarget.type === "archive" ? "Archivovať" : "Natrvalo vymazať")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

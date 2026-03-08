"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Plus, ChevronLeft, ChevronRight, MoreHorizontal, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { ShiftDialog, type ShiftForEdit, type EmployeeOption } from "./shift-dialog"
import { deleteShift, toggleShiftStatus, publishDraftShifts } from "@/app/actions/schedule"

export interface ShiftRow {
  id: string
  userId: string
  userName: string
  date: string
  dateLabel: string
  startTime: string
  endTime: string
  note: string | null
  status: "draft" | "published"
}

interface AdminScheduleTableProps {
  shifts: ShiftRow[]
  employees: EmployeeOption[]
  weekLabel: string
  prevWeek: string
  nextWeek: string
}

export function AdminScheduleTable({
  shifts,
  employees,
  weekLabel,
  prevWeek,
  nextWeek,
}: AdminScheduleTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ShiftForEdit | undefined>()
  const [isPending, startTransition] = useTransition()

  const draftIds = shifts.filter((s) => s.status === "draft").map((s) => s.id)

  function openCreate() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function openEdit(s: ShiftRow) {
    setEditing({
      id: s.id,
      userId: s.userId,
      frequency: "once",
      date: s.date,
      days: null,
      dayOfMonth: null,
      validFrom: null,
      validUntil: null,
      startTime: s.startTime,
      endTime: s.endTime,
      allDay: false,
      note: s.note,
    })
    setDialogOpen(true)
  }

  function handleDelete(id: string) {
    startTransition(() => deleteShift(id))
  }

  function handleToggle(id: string, status: "draft" | "published") {
    startTransition(() => toggleShiftStatus(id, status))
  }

  function handlePublishAll() {
    startTransition(() => publishDraftShifts(draftIds))
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" asChild>
              <Link href={`/admin/schedule?from=${prevWeek}`}>
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
            <span className="text-sm font-medium min-w-48 text-center">{weekLabel}</span>
            <Button variant="outline" size="icon" asChild>
              <Link href={`/admin/schedule?from=${nextWeek}`}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {draftIds.length > 0 && (
              <Button variant="secondary" onClick={handlePublishAll} disabled={isPending}>
                <Send className="size-4" />
                Publikovať všetky ({draftIds.length})
              </Button>
            )}
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Nová zmena
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dátum</TableHead>
                <TableHead>Zamestnanec</TableHead>
                <TableHead>Začiatok</TableHead>
                <TableHead>Koniec</TableHead>
                <TableHead>Poznámka</TableHead>
                <TableHead>Stav</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Žiadne zmeny tento týždeň
                  </TableCell>
                </TableRow>
              ) : (
                shifts.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.dateLabel}</TableCell>
                    <TableCell>{s.userName}</TableCell>
                    <TableCell>{s.startTime}</TableCell>
                    <TableCell>{s.endTime}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {s.note ?? "—"}
                    </TableCell>
                    <TableCell>
                      {s.status === "draft" ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                          Publikovaná
                        </Badge>
                      ) : (
                        <Badge variant="outline">Draft</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(s)}>
                            Upraviť
                          </DropdownMenuItem>
                          {s.status === "draft" && (
                            <DropdownMenuItem
                              onClick={() => handleToggle(s.id, s.status)}
                              disabled={isPending}
                            >
                              Publikovať
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDelete(s.id)}
                            disabled={isPending}
                          >
                            Odstrániť
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ShiftDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employees={employees}
        shift={editing}
      />
    </>
  )
}
